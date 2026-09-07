from pydantic import BaseModel
from pydantic.alias_generators import to_camel

def columns_of[T: BaseModel](
    model: type[T], exclude: set[str] = frozenset()
) -> str:
    return ", ".join(f for f in model.model_fields if f not in exclude)

def placeholders_of[T: BaseModel](
    model: type[T], exclude: set[str] = frozenset()
) -> str:
    return ", ".join(f"%({f})s" for f in model.model_fields if f not in exclude)

def rows_to_models[T: BaseModel](cursor, model: type[T]) -> list[T]:
    cols = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    return [model(**dict(zip(cols, row))) for row in rows]

def assignments_of[T: BaseModel](
    model: type[T], exclude: set[str] = frozenset()
) -> str:
    return ", ".join(f"{f} = %({f})s" for f in model.model_fields if f not in exclude)

def graph_assignments_of[T: BaseModel](model: type[T],prefix: str, exclude: set[str] = frozenset()) -> str:
    return ", ".join(f"{prefix}{to_camel(f)}= ${f}" for f in model.model_fields if f not in exclude)