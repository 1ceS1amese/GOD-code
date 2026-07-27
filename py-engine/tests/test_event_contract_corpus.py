import json
from pathlib import Path

import pytest

from god_code_engine.api.god_code_api_models import GodCodeEventEnvelope, ValidationError


CORPUS_PATH = Path(__file__).parents[2] / "protocol" / "fixtures" / "god_code_event_contract.json"
CORPUS = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


def build_event(payload: dict[str, object]) -> GodCodeEventEnvelope:
    return GodCodeEventEnvelope(
        event_type=payload["event_type"],
        session_id=payload["session_id"],
        turn_id=payload.get("turn_id"),
        payload=payload["payload"],
        sequence=payload["sequence"],
    )


def test_event_contract_corpus_version() -> None:
    assert CORPUS["contract_version"] == 2


@pytest.mark.parametrize("case", CORPUS["valid"], ids=lambda case: case["name"])
def test_event_contract_corpus_accepts_valid_cases(case: dict[str, object]) -> None:
    assert build_event(case["event"]).to_dict() == case["event"]


@pytest.mark.parametrize("case", CORPUS["invalid"], ids=lambda case: case["name"])
def test_event_contract_corpus_rejects_invalid_cases(case: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        build_event(case["event"])
