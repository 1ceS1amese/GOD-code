import json

from god_code_engine.providers.contracts import (
    contract_check_names,
    run_provider_contract_tests,
)


def test_provider_contract_runner_reports_all_checks_ok() -> None:
    report = run_provider_contract_tests()

    assert report["ok"] is True
    checks = report["checks"]
    assert isinstance(checks, list)
    assert [check["name"] for check in checks] == contract_check_names()
    assert all(check["status"] == "ok" for check in checks)


def test_provider_contract_report_does_not_leak_api_key_values() -> None:
    report = run_provider_contract_tests()

    encoded = json.dumps(report, ensure_ascii=False)

    assert "contract-secret" not in encoded
    assert "Authorization" not in encoded
    assert "x-api-key" not in encoded
