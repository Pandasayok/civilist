"""Fixtures prepare each browser; the npm runner prepares the disposable server."""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect


def pytest_configure(config):
    """Refuse a live site before reading any credentials or starting a browser."""
    target = urlsplit(os.environ.get("CIVILIST_TEST_BASE_URL", ""))
    if (
        target.scheme != "http"
        or target.hostname not in {"127.0.0.1", "localhost"}
        or not target.port
        or target.username
        or target.password
        or target.path not in {"", "/"}
        or target.query
        or target.fragment
        or config.getoption("base_url") not in {None, "", target.geturl()}
        or not os.environ.get("CIVILIST_TEST_CREDENTIALS_DIR")
    ):
        raise pytest.UsageError(
            "Запускай UI-тесты через npm run test:ui: нужны временные коды и локальный HTTP Worker."
        )


@pytest.fixture(scope="session")
def base_url():
    return os.environ["CIVILIST_TEST_BASE_URL"]


@pytest.fixture(scope="session")
def account_codes():
    path = Path(os.environ["CIVILIST_TEST_CREDENTIALS_DIR"]) / ".civilist-access-local.txt"
    # Only freshly generated LOCAL codes, never codes of QA or production.
    codes = {}
    for line in path.read_text().splitlines():
        match = re.fullmatch(r".+ \((admin|learner)\): (\S+)", line)
        if match:
            codes[match[1]] = match[2]
    if set(codes) != {"admin", "learner"}:
        raise pytest.UsageError("Не найдены оба временных кода доступа.")
    return codes


@pytest.fixture(scope="session")
def seed_questions():
    root = Path(__file__).resolve().parents[2]
    bank = json.loads((root / "content/seed.json").read_text())["questions"] + json.loads((root / "content/course-contracts.json").read_text())["questions"]
    return {q["title"]: q for q in bank}


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, base_url):
    return {**browser_context_args, "base_url": base_url, "locale": "ru-RU", "timezone_id": "Europe/Moscow", "viewport": {"width": 1440, "height": 900}}


@pytest.fixture
def login(account_codes):
    def enter(page, role="learner"):
        page.goto("/login")
        page.get_by_label("Код доступа").fill(account_codes[role])
        page.get_by_role("button", name="Войти", exact=True).click()
        expect(page.get_by_role("heading", name=re.compile("^Рада видеть тебя,"))).to_be_visible()
    return enter
