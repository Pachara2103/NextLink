"""Real PostgreSQL regression tests, with only auth and Friday routers mounted."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import uuid4

import psycopg2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import TEST_URL
from core.exception_handlers import app_exception_handler
from core.exceptions import AppException
from schemas.friday_activity import FridayActivityCreate, FridayActivityUpdate
from services.friday_activity import create_activity_in_transaction, update_activity_in_transaction

BASE = "/api/v1/friday-activities"


def execute(sql, params=(), *, fetch=False):
    with psycopg2.connect(TEST_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall() if fetch else None


@pytest.fixture
def friday_client(clean_database):
    from api.v1.auth import router as auth_router
    from api.v1.friday_activity import router
    execute("UPDATE users SET role='staff' WHERE username='alice'; UPDATE users SET role='admin' WHERE username='bob';")
    execute("""INSERT INTO companies(company_th) VALUES ('บริษัททดสอบ'),('Other company');
        INSERT INTO employees(company_id,name_th,status) VALUES (1,'พนักงานจริง','active');
        INSERT INTO contacts(company_id,name) VALUES (1,'ผู้ติดต่อจริง');""")
    app = FastAPI()
    app.add_exception_handler(AppException, app_exception_handler)
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(router, prefix="/api/v1")
    with TestClient(app) as client:
        yield client


def sign_in(client, username="alice"):
    response = client.post("/api/v1/auth/login", json={"username":username,"password":"correct-password"})
    assert response.status_code == 200, response.text
    return {"Authorization":"Bearer "+response.json()["accessToken"]}


def payload(**changes):
    data = {
        "idempotencyKey":str(uuid4()), "academicYear":2026,"term":"FIRST","title":"Friday จริง",
        "description":None,"domain":"Software","format":"talk","ownerUserId":"1","companyIds":["1"],
        "people":[{"namespace":"employee","sourceId":"1","name":"untrusted label","role":"speaker"},
                  {"namespace":"contact","sourceId":"1","name":"untrusted label","role":"coordinator"}],
        "sessions":[{"sessionDate":"2026-10-16","startTime":"09:00","endTime":"12:00","location":"ห้อง 1",
                     "status":"planned","capacity":30,"booked":None,"attended":None}],
    }
    data.update(changes)
    return data


def create(client, headers, **changes):
    response = client.post(BASE, headers=headers, json=payload(**changes))
    assert response.status_code == 201, response.text
    return response.json()


def editable(activity, **changes):
    data = {key:deepcopy(activity[key]) for key in ["academicYear","term","title","description","domain","format","ownerUserId","companyIds","people","sessions"]}
    data["expectedRevision"] = activity["revision"]
    data.update(changes)
    return data


def transition(client, headers, activity, status, reason=None):
    response = client.post(f"{BASE}/{activity['id']}/transitions", headers=headers,
        json={"expectedRevision":activity["revision"],"status":status,"reason":reason})
    assert response.status_code == 200, response.text
    return response.json()


def test_two_accounts_share_postgres_and_namespaces_are_distinct(friday_client):
    alice,bob = sign_in(friday_client),sign_in(friday_client,"bob")
    created = create(friday_client,alice)
    read = friday_client.get(f"{BASE}/{created['id']}",headers=bob)
    assert read.status_code == 200
    assert read.json() == created
    assert created["id"].isdigit() and created["status"] == "draft"
    assert [(p["namespace"],p["sourceId"],p["name"]) for p in created["people"]] == [
        ("employee","1","พนักงานจริง"),("contact","1","ผู้ติดต่อจริง")]
    assert created["sessions"][0]["booked"] is None
    assert created["companies"] == [{"id":"1","name":"บริษัททดสอบ"}]
    assert friday_client.get(BASE,headers=bob).json()["source"] == "postgresql"


def test_staff_assignment_active_flag_and_revocation_checked_for_every_route(friday_client):
    headers = sign_in(friday_client)
    created = create(friday_client,headers)
    paths = [BASE,f"{BASE}/options",f"{BASE}/{created['id']}",f"{BASE}/{created['id']}/history"]
    for path in paths:
        assert friday_client.get(path).status_code == 401
    execute("UPDATE users SET role=NULL WHERE id=1")
    for path in paths:
        assert friday_client.get(path,headers=headers).status_code == 403
    assert friday_client.post(BASE,headers=headers,json=payload()).status_code == 403
    assert friday_client.put(f"{BASE}/{created['id']}",headers=headers,json=editable(created)).status_code == 403
    assert friday_client.post(f"{BASE}/{created['id']}/transitions",headers=headers,
        json={"expectedRevision":1,"status":"contacting"}).status_code == 403
    execute("UPDATE users SET role='staff',is_active=false WHERE id=1")
    assert friday_client.get(BASE,headers=headers).status_code == 401
    execute("UPDATE users SET is_active=true WHERE id=1")
    friday_client.post("/api/v1/auth/logout",headers=headers)
    assert friday_client.get(BASE,headers=headers).status_code == 401


def test_create_retry_concurrent_requests_and_payload_mismatch(friday_client):
    headers = sign_in(friday_client)
    data = payload()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _:friday_client.post(BASE,headers=headers,json=data),range(4)))
    assert [r.status_code for r in results] == [201]*4
    assert len({r.json()["id"] for r in results}) == 1
    assert execute("SELECT count(*) FROM friday_activities",fetch=True) == [(1,)]
    assert execute("SELECT count(*) FROM friday_audit_events",fetch=True) == [(1,)]
    data["title"] = "Different request"
    assert friday_client.post(BASE,headers=headers,json=data).status_code == 409


def test_same_revision_concurrent_updates_have_one_winner_and_atomic_audit(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda n:friday_client.put(f"{BASE}/{activity['id']}",headers=headers,
            json=editable(activity,title=f"Writer {n}")),range(2)))
    assert sorted(r.status_code for r in results) == [200,409]
    current = friday_client.get(f"{BASE}/{activity['id']}",headers=headers).json()
    assert current["revision"] == 2
    history = friday_client.get(f"{BASE}/{activity['id']}/history",headers=headers).json()["items"]
    assert len(history) == 2
    assert history[0]["before"]["revision"] == 1 and history[0]["after"]["revision"] == 2
    assert history[0]["actorUserId"] == "1" and history[0]["actorName"] == "alice"


def test_invalid_child_reference_rolls_back_parent_company_and_audit(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    invalid = editable(activity,title="Must roll back",companyIds=["1","2"])
    invalid["sessions"][0]["id"] = "999999"
    assert friday_client.put(f"{BASE}/{activity['id']}",headers=headers,json=invalid).status_code == 400
    assert friday_client.get(f"{BASE}/{activity['id']}",headers=headers).json() == activity
    assert execute("SELECT count(*) FROM friday_audit_events",fetch=True) == [(1,)]
    assert execute("SELECT count(*) FROM friday_mutation_receipts",fetch=True) == [(1,)]


def test_import_transaction_helper_never_commits_its_callers_transaction(friday_client):
    conn = psycopg2.connect(TEST_URL)
    try:
        created = create_activity_in_transaction(conn,FridayActivityCreate.model_validate(payload()),"1",operation="import.create")
        assert created.id
        conn.rollback()
    finally:
        conn.close()
    assert execute("SELECT count(*) FROM friday_activities",fetch=True) == [(0,)]
    assert execute("SELECT count(*) FROM friday_audit_events",fetch=True) == [(0,)]
    assert execute("SELECT count(*) FROM friday_mutation_receipts",fetch=True) == [(0,)]


@pytest.mark.parametrize("changes", [
    {"academicYear":2569}, {"term":"1"}, {"capacity":-1}, {"capacity":True}, {"capacity":"10"},
    {"sessionDate":"16/10/2026"}, {"startTime":"09:00Z"}, {"startTime":"13:00","endTime":"12:00"},
])
def test_calendar_counts_and_types_are_explicit(friday_client, changes):
    headers = sign_in(friday_client)
    data = payload()
    for key,value in changes.items():
        if key in {"academicYear","term"}:
            data[key] = value
        else:
            data["sessions"][0][key] = value
    assert friday_client.post(BASE,headers=headers,json=data).status_code == 422
    assert execute("SELECT count(*) FROM friday_activities",fetch=True) == [(0,)]


def test_reference_validation_and_foreign_keys_preserve_business_history(friday_client):
    headers = sign_in(friday_client)
    assert friday_client.post(BASE,headers=headers,json=payload(companyIds=["999"])).status_code == 400
    assert friday_client.post(BASE,headers=headers,json=payload(ownerUserId="999")).status_code == 400
    assert friday_client.post(BASE,headers=headers,json=payload(companyIds=["2"])).status_code == 400
    create(friday_client,headers)
    for table in ["companies","employees","contacts","users"]:
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            execute(f"DELETE FROM {table} WHERE id=1")


def test_lifecycle_requires_explicit_completion_and_reason_for_rescheduling(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    activity = transition(friday_client,headers,activity,"confirmed")
    moved = editable(activity)
    moved["sessions"][0]["sessionDate"] = "2026-10-23"
    assert friday_client.put(f"{BASE}/{activity['id']}",headers=headers,json=moved).status_code == 400
    moved["reason"] = "บริษัทขอเลื่อน"
    response = friday_client.put(f"{BASE}/{activity['id']}",headers=headers,json=moved)
    assert response.status_code == 200
    activity = transition(friday_client,headers,response.json(),"in_progress")
    assert friday_client.post(f"{BASE}/{activity['id']}/transitions",headers=headers,
        json={"expectedRevision":activity["revision"],"status":"completed"}).status_code == 400
    held = editable(activity,reason="เจ้าหน้าที่บันทึกผลจัดงาน")
    held["sessions"][0].update(status="held",attended=42)
    response = friday_client.put(f"{BASE}/{activity['id']}",headers=headers,json=held)
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"  # Dates/counts never complete an activity.
    activity = transition(friday_client,headers,response.json(),"completed")
    assert activity["sessions"][0]["attended"] == 42  # Above capacity is retained.
    assert friday_client.put(f"{BASE}/{activity['id']}",headers=headers,json=editable(activity,title="Corrected history")).status_code == 400
    assert friday_client.post(f"{BASE}/{activity['id']}/transitions",headers=headers,
        json={"expectedRevision":activity["revision"],"status":"confirmed"}).status_code == 400
    assert transition(friday_client,headers,activity,"confirmed","แก้ประวัติ")["status"] == "confirmed"


def test_confirmed_gate_cancel_and_stale_transition(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers,sessions=[])
    assert friday_client.post(f"{BASE}/{activity['id']}/transitions",headers=headers,
        json={"expectedRevision":1,"status":"confirmed"}).status_code == 400
    assert friday_client.post(f"{BASE}/{activity['id']}/transitions",headers=headers,
        json={"expectedRevision":1,"status":"cancelled"}).status_code == 400
    cancelled = transition(friday_client,headers,activity,"cancelled","บริษัทยกเลิก")
    assert friday_client.post(f"{BASE}/{activity['id']}/transitions",headers=headers,
        json={"expectedRevision":1,"status":"draft","reason":"เปิดใหม่"}).status_code == 409
    assert transition(friday_client,headers,cancelled,"draft","เปิดใหม่")["revision"] == 3


def test_metrics_use_filtered_held_sessions_distinguish_unknown_zero_and_exclude_cancelled(friday_client):
    headers = sign_in(friday_client)
    data = payload()
    data["sessions"] = [dict(data["sessions"][0],status="held",attended=None)]
    unknown = create(friday_client,headers,**data)
    result = friday_client.get(BASE,headers=headers).json()
    assert result["summary"]["attended"] is None and result["summary"]["unknownAttendance"] == 1
    zero = create(friday_client,headers,**payload(sessions=[dict(data["sessions"][0],status="held",attended=0)]))
    result = friday_client.get(BASE,headers=headers).json()
    assert result["summary"]["attended"] == 0 and result["summary"]["unknownAttendance"] == 1
    cancelled = create(friday_client,headers,**payload(sessions=[dict(data["sessions"][0],status="held",attended=900)]))
    transition(friday_client,headers,cancelled,"cancelled","Cancelled historical duplicate")
    result = friday_client.get(BASE+"?academicYear=2026&term=FIRST&pageSize=1",headers=headers).json()
    assert result["total"] == 3 and len(result["items"]) == 1
    assert result["summary"] == {"total":3,"completed":0,"companies":1,"attended":0,"unknownAttendance":1}
    assert friday_client.get(BASE+"?academicYear=2025",headers=headers).json()["summary"]["attended"] is None
    assert unknown["sessions"][0]["attended"] is None and zero["sessions"][0]["attended"] == 0


def test_options_and_filters_come_only_from_canonical_postgres(friday_client):
    headers = sign_in(friday_client)
    create(friday_client,headers,title="Percent 100% literal")
    create(friday_client,headers,title="Percent 1000",companyIds=["2"],people=[])
    options = friday_client.get(BASE+"/options",headers=headers).json()
    assert len(options["companies"]) == 2 and len(options["owners"]) == 2
    assert {p["namespace"] for p in options["people"]} == {"employee","contact"}
    assert options["periods"] == [{"academicYear":2026,"term":"FIRST"}]
    assert friday_client.get(BASE+"?search=%25",headers=headers).json()["total"] == 1
    assert friday_client.get(BASE+"?companyId=2",headers=headers).json()["total"] == 1
    assert friday_client.get(BASE+"?status=completed",headers=headers).json()["total"] == 0
    assert friday_client.get(BASE+"/9999999999999999999",headers=headers).status_code == 400
    assert friday_client.get(BASE+"/999999",headers=headers).status_code == 404


def test_create_receipt_returns_original_result_after_later_edits(friday_client):
    headers = sign_in(friday_client)
    data = payload()
    original = friday_client.post(BASE,headers=headers,json=data).json()
    changed = friday_client.put(f"{BASE}/{original['id']}",headers=headers,json=editable(original,title="Updated"))
    assert changed.status_code == 200
    retry = friday_client.post(BASE,headers=headers,json=data)
    assert retry.json() == original
    assert friday_client.get(f"{BASE}/{original['id']}",headers=headers).json()["revision"] == 2


def test_unrelated_edit_keeps_crm_identity_snapshots_and_stable_child_ids(friday_client):
    headers = sign_in(friday_client)
    original = create(friday_client,headers)
    execute("UPDATE employees SET name_th='New current name',company_id=2 WHERE id=1")
    execute("UPDATE contacts SET name='New contact name' WHERE id=1")
    changed = friday_client.put(f"{BASE}/{original['id']}",headers=headers,json=editable(original,title="Updated count report"))
    assert changed.status_code == 200, changed.text
    assert changed.json()["people"] == original["people"]
    assert changed.json()["sessions"] == original["sessions"]
    # Selecting that identity anew captures its current canonical name.
    new_person = {"namespace":"contact","sourceId":"1","role":"speaker"}
    added = friday_client.put(f"{BASE}/{original['id']}",headers=headers,
        json=editable(changed.json(),people=changed.json()["people"]+[new_person]))
    assert added.status_code == 200
    assert added.json()["people"][-1]["name"] == "New contact name"


def test_earlier_started_transaction_cannot_move_updated_time_backwards(friday_client):
    headers = sign_in(friday_client)
    original = create(friday_client,headers)
    old_transaction = psycopg2.connect(TEST_URL)
    try:
        with old_transaction.cursor() as cursor:
            cursor.execute("SELECT now()")  # This transaction starts before the API write.
        changed = friday_client.put(f"{BASE}/{original['id']}",headers=headers,json=editable(original,title="First write"))
        assert changed.status_code == 200
        latest = changed.json()
        result = update_activity_in_transaction(old_transaction,original["id"],
            FridayActivityUpdate.model_validate(editable(latest,title="Later write from old transaction")),"1")
        old_transaction.commit()
        assert result.updated_at.isoformat() >= latest["updatedAt"].replace("Z","+00:00")
    finally:
        old_transaction.close()


def test_search_matches_company_alias_domain_and_session_location(friday_client):
    from urllib.parse import urlencode
    headers = sign_in(friday_client)
    execute("UPDATE companies SET aliases=ARRAY['Canonical alias'] WHERE id=1")
    create(friday_client,headers,domain="Data Science")
    for text in ["บริษัททดสอบ","Canonical alias","Data Science","ห้อง 1"]:
        result = friday_client.get(BASE+"?"+urlencode({"search":text}),headers=headers)
        assert result.status_code == 200
        assert result.json()["total"] == 1, text


def test_legacy_crm_name_shapes_do_not_break_options_or_history(friday_client):
    headers = sign_in(friday_client)
    execute("UPDATE employees SET name_th='',name_en=NULL,nickname=NULL WHERE id=1")
    options = friday_client.get(BASE+"/options",headers=headers)
    assert options.status_code == 200
    assert next(p for p in options.json()["people"] if p["namespace"] == "employee")["name"] == "Employee 1"
    blank = create(friday_client,headers)
    assert blank["people"][0]["name"] == "Employee 1"
    long_name = "ก"*700
    execute("UPDATE employees SET name_th=%s WHERE id=1",(long_name,))
    created = create(friday_client,headers)
    assert created["people"][0]["name"] == long_name
    updated = friday_client.put(f"{BASE}/{created['id']}",headers=headers,json=editable(created,title="Keep full CRM name"))
    assert updated.status_code == 200
    assert updated.json()["people"][0]["name"] == long_name


def test_referenced_crm_delete_returns_409_and_never_enqueues_graph_mutation(friday_client,monkeypatch):
    from api.v1.contact import router as contacts_router
    from api.v1.employee import router as employees_router
    from services import outbox
    friday_client.app.include_router(contacts_router,prefix="/api/v1")
    friday_client.app.include_router(employees_router,prefix="/api/v1")
    headers = sign_in(friday_client)
    create(friday_client,headers)

    def unexpected_graph_work(*args,**kwargs):
        pytest.fail("Rejected CRM deletion must not enqueue or flush graph work")
    monkeypatch.setattr(outbox,"enqueue",unexpected_graph_work)
    monkeypatch.setattr(outbox,"flush",unexpected_graph_work)
    for path in ["/api/v1/contacts/1","/api/v1/employees/1","/api/v1/employees/1/sync"]:
        response = friday_client.delete(path,headers=headers)
        assert response.status_code == 409, response.text
        assert "ถูกอ้างอิง" in response.json()["detail"]
    assert execute("SELECT count(*) FROM contacts WHERE id=1",fetch=True) == [(1,)]
    assert execute("SELECT count(*) FROM employees WHERE id=1",fetch=True) == [(1,)]
    assert friday_client.get(BASE,headers=headers).json()["total"] == 1
    # The existing unreferenced-delete and not-found behavior still works.
    execute("INSERT INTO contacts(company_id,name) VALUES(1,'Unreferenced'); INSERT INTO employees(company_id,name_th) VALUES(1,'Unreferenced');")
    for resource in ["contacts","employees"]:
        assert friday_client.delete(f"/api/v1/{resource}/2",headers=headers).status_code == 200
        assert friday_client.delete(f"/api/v1/{resource}/2",headers=headers).status_code == 404
