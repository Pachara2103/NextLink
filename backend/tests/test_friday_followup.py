"""Real PostgreSQL checks for the aggregate revision, receipts and provenance."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg2
import pytest

from conftest import TEST_URL
from schemas.friday_followup import NoteWrite
from services.friday_followup import write_item_in_transaction
from test_friday_core import BASE, create, editable, execute, friday_client, sign_in


def note(revision=1, **changes):
    return {"expectedRevision":revision,"idempotencyKey":str(uuid4()),"kind":"fact",
        "body":"บริษัทแจ้งกำหนดการผ่านอีเมล","reference":"อีเมลวันที่ 18 ตุลาคม",
        "occurredAt":"2026-10-18T10:00:00+07:00",**changes}


def task(revision=1, **changes):
    return {"expectedRevision":revision,"idempotencyKey":str(uuid4()),"title":"ยืนยันวิทยากร",
        "assigneeUserId":"2","dueDate":"2026-10-23","status":"open",**changes}


def test_note_versions_preserve_author_fact_comment_and_distinct_times(friday_client):
    alice,bob = sign_in(friday_client),sign_in(friday_client,"bob")
    activity = create(friday_client,alice)
    path = f"{BASE}/{activity['id']}/notes"
    data = note()
    response = friday_client.post(path,headers=alice,json=data)
    assert response.status_code == 201, response.text
    original = response.json()
    item = original["item"]
    assert item["authorUserId"] == "1" and item["version"] == 1
    assert item["occurredAt"] != item["recordedAt"]
    assert original["activity"]["revision"] == 2
    assert friday_client.post(path,headers=alice,json=data).json() == original
    changed = note(2,kind="comment",body="ความเห็นหลังคุยกับบริษัท",reason="แก้การจัดประเภท")
    updated = friday_client.put(path+"/"+item["id"],headers=bob,json=changed)
    assert updated.status_code == 200, updated.text
    assert updated.json()["item"]["authorUserId"] == "1"
    assert updated.json()["item"]["updatedByUserId"] == "2"
    versions = friday_client.get(path+"/"+item["id"]+"/versions?limit=1",headers=bob).json()
    assert versions["items"][0]["snapshot"]["kind"] == "comment" and versions["nextCursor"] == 2
    older = friday_client.get(path+"/"+item["id"]+"/versions?beforeVersion=2",headers=bob).json()
    assert older["items"][0]["snapshot"] == item
    assert older["items"][0]["editorUserId"] == "1"
    # Exact retries remain the original receipt, even after a later edit.
    assert friday_client.post(path,headers=alice,json=data).json() == original
    history = friday_client.get(f"{BASE}/{activity['id']}/history",headers=bob).json()["items"]
    assert history[0]["detail"]["before"] == item
    assert history[0]["detail"]["after"]["kind"] == "comment"
    assert execute("SELECT count(*) FROM notes",fetch=True) == [(0,)]


def test_task_ownership_due_date_and_status_audit(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    path = f"{BASE}/{activity['id']}/tasks"
    assert friday_client.post(path,headers=headers,json=task(assigneeUserId="999")).status_code == 400
    assert friday_client.post(path,headers=headers,json=task(status="done")).status_code == 400
    created = friday_client.post(path,headers=headers,json=task()).json()
    assert created["item"]["assigneeName"] == "bob"
    assert created["item"]["dueDate"] == "2026-10-23"
    item_path = path+"/"+created["item"]["id"]
    done = friday_client.put(item_path,headers=headers,json=task(2,status="done"))
    assert done.status_code == 200, done.text
    assert friday_client.put(item_path,headers=headers,json=task(3,status="open")).status_code == 400
    reopened = friday_client.put(item_path,headers=headers,json=task(3,reason="ต้องขอยืนยันอีกครั้ง"))
    assert reopened.status_code == 200
    assert friday_client.put(item_path,headers=headers,json=task(4,status="cancelled")).status_code == 400
    cancelled = friday_client.put(item_path,headers=headers,json=task(4,status="cancelled",reason="ย้ายไปงานใหม่"))
    assert cancelled.status_code == 200
    execute("UPDATE users SET is_active=false WHERE id=2")
    assert friday_client.post(path,headers=headers,json=task(5)).status_code == 400
    # History remains editable without silently reassigning a former employee.
    assert friday_client.put(item_path,headers=headers,json=task(5,status="cancelled",title="Corrected title")).status_code == 200


def test_concurrent_note_and_activity_edit_share_one_revision(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    path = f"{BASE}/{activity['id']}"
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(friday_client.post,path+"/notes",headers=headers,json=note())
        b = pool.submit(friday_client.put,path,headers=headers,json=editable(activity,title="Another writer"))
        statuses = [a.result().status_code,b.result().status_code]
    assert statuses in ([201,409],[409,200])
    assert friday_client.get(path,headers=headers).json()["revision"] == 2
    assert execute("SELECT count(*) FROM friday_audit_events",fetch=True) == [(2,)]


def test_concurrent_retry_and_changed_command_never_duplicate(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    path = f"{BASE}/{activity['id']}/tasks"
    data = task()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _:friday_client.post(path,headers=headers,json=data),range(2)))
    assert [r.status_code for r in results] == [201,201]
    assert results[0].json() == results[1].json()
    assert friday_client.post(path,headers=headers,json={**data,"title":"different"}).status_code == 409
    assert execute("SELECT count(*) FROM friday_tasks",fetch=True) == [(1,)]


def test_wrong_activity_ids_and_stale_revision_leave_no_changes(friday_client):
    headers = sign_in(friday_client)
    one,two = create(friday_client,headers),create(friday_client,headers)
    path = f"{BASE}/{one['id']}/notes"
    original = friday_client.post(path,headers=headers,json=note()).json()
    item = original["item"]
    other = f"{BASE}/{two['id']}/notes/{item['id']}"
    assert friday_client.put(other,headers=headers,json=note(reason="wrong activity")).status_code == 404
    assert friday_client.get(other+"/versions",headers=headers).status_code == 404
    assert friday_client.put(path+"/"+item["id"],headers=headers,json=note(reason="stale")).status_code == 409
    assert friday_client.put(path+"/"+item["id"],headers=headers,json=note(2)).status_code == 400
    assert friday_client.get(path,headers=headers).json()["items"] == [item]
    assert execute("SELECT count(*) FROM friday_note_versions",fetch=True) == [(1,)]


def test_audit_failure_rolls_back_note_version_revision_and_receipt(friday_client,monkeypatch):
    from services import friday_followup
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    def fail(*args,**kwargs):
        raise RuntimeError("synthetic audit failure")
    monkeypatch.setattr(friday_followup,"_audit",fail)
    assert friday_client.post(f"{BASE}/{activity['id']}/notes",headers=headers,json=note()).status_code == 500
    assert friday_client.get(f"{BASE}/{activity['id']}",headers=headers).json() == activity
    for table in ["friday_notes","friday_note_versions"]:
        assert execute(f"SELECT count(*) FROM {table}",fetch=True) == [(0,)]
    assert execute("SELECT count(*) FROM friday_mutation_receipts",fetch=True) == [(1,)]


def test_transaction_helper_does_not_commit_and_pagination_is_stable(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    with psycopg2.connect(TEST_URL) as conn:
        write_item_in_transaction(conn,activity["id"],"note",NoteWrite.model_validate(note()),"1")
        conn.rollback()
    assert execute("SELECT count(*) FROM friday_notes",fetch=True) == [(0,)]
    path = f"{BASE}/{activity['id']}"
    for revision in range(1,4):
        assert friday_client.post(path+"/notes",headers=headers,json=note(revision)).status_code == 201
    first = friday_client.get(path+"/notes?limit=2",headers=headers).json()
    assert len(first["items"]) == 2 and first["nextCursor"]
    assert friday_client.post(path+"/notes",headers=headers,json=note(4)).status_code == 201
    rest = friday_client.get(path+"/notes?beforeId="+first["nextCursor"],headers=headers).json()
    assert len(rest["items"]) == 1 and rest["nextCursor"] is None
    assert not {n["id"] for n in first["items"]} & {n["id"] for n in rest["items"]}
    history = friday_client.get(path+"/history?limit=2",headers=headers).json()
    assert len(history["items"]) == 2 and history["nextCursor"]
    older = friday_client.get(path+"/history?beforeId="+history["nextCursor"],headers=headers).json()
    assert len(older["items"]) == 3


@pytest.mark.parametrize("changes", [{"body":" "},{"kind":"issue"},{"occurredAt":"2026-10-19T12:00:00"},{"occurredAt":1234},{"expectedRevision":True}])
def test_note_validation(friday_client,changes):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    assert friday_client.post(f"{BASE}/{activity['id']}/notes",headers=headers,json=note(**changes)).status_code == 422


@pytest.mark.parametrize("changes", [{"dueDate":"23/10/2026"},{"dueDate":1234},{"dueDate":None},{"assigneeUserId":"9223372036854775808"},{"title":" "}])
def test_task_validation(friday_client,changes):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    assert friday_client.post(f"{BASE}/{activity['id']}/tasks",headers=headers,json=task(**changes)).status_code == 422


def test_staff_revocation_protects_every_followup_route(friday_client):
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    path = f"{BASE}/{activity['id']}"
    item = friday_client.post(path+"/notes",headers=headers,json=note()).json()["item"]
    routes = [("get",path+"/notes",None),("get",path+"/tasks",None),
        ("get",path+"/notes/"+item["id"],None),("get",path+"/tasks/1",None),
        ("get",path+"/notes/"+item["id"]+"/versions",None),
        ("post",path+"/notes",note(2)),("put",path+"/notes/"+item["id"],note(2,reason="edit")),
        ("post",path+"/tasks",task(2)),("put",path+"/tasks/1",task(2))]
    execute("UPDATE users SET role=NULL WHERE id=1")
    for method,url,data in routes:
        assert friday_client.request(method,url,json=data).status_code == 401
        assert friday_client.request(method,url,headers=headers,json=data).status_code == 403
    execute("UPDATE users SET is_active=false WHERE id=1")
    assert friday_client.get(path+"/notes",headers=headers).status_code == 401


@pytest.mark.parametrize("collection,payload", [("notes",note),("tasks",task)])
def test_single_followup_read_finds_older_item_and_enforces_activity_scope(friday_client,collection,payload):
    headers = sign_in(friday_client)
    activity,other = create(friday_client,headers),create(friday_client,headers)
    path = f"{BASE}/{activity['id']}/{collection}"
    oldest = friday_client.post(path,headers=headers,json=payload()).json()["item"]
    for revision in range(2,52):
        assert friday_client.post(path,headers=headers,json=payload(revision)).status_code == 201
    assert oldest["id"] not in [x["id"] for x in friday_client.get(path,headers=headers).json()["items"]]
    result = friday_client.get(path+"/"+oldest["id"],headers=headers)
    assert result.status_code == 200
    assert result.json()["item"] == oldest
    assert result.json()["activity"]["revision"] == 52
    assert friday_client.get(f"{BASE}/{other['id']}/{collection}/{oldest['id']}",headers=headers).status_code == 404
    assert friday_client.get(path+"/999999999",headers=headers).status_code == 404
    assert friday_client.get(path+"/9223372036854775808",headers=headers).status_code == 400


def test_single_followup_and_revision_use_one_read_snapshot(friday_client,monkeypatch):
    from services import friday_followup
    headers = sign_in(friday_client)
    activity = create(friday_client,headers)
    path = f"{BASE}/{activity['id']}/notes"
    original = friday_client.post(path,headers=headers,json=note()).json()
    read = friday_followup._read
    changed = False
    def concurrent_read(conn,kind,activity_id,item_id=None,**kwargs):
        nonlocal changed
        if not changed:
            changed = True
            # Commit another writer after get_item reads the parent revision.
            updated = friday_client.put(path+"/"+original["item"]["id"],headers=headers,
                json=note(2,body="concurrently corrected",reason="correction"))
            assert updated.status_code == 200
        return read(conn,kind,activity_id,item_id,**kwargs)
    monkeypatch.setattr(friday_followup,"_read",concurrent_read)
    result = friday_client.get(path+"/"+original["item"]["id"],headers=headers).json()
    assert result == original
    assert friday_client.get(f"{BASE}/{activity['id']}",headers=headers).json()["revision"] == 3
