"""Study outline navigation and completion against the temporary local database."""
import re

import pytest
from playwright.sync_api import expect


@pytest.mark.parametrize("mobile", [False, True], ids=["desktop", "mobile"])
def test_curriculum_opens_topic_and_restores_section(page, login, mobile):
    if mobile:
        page.set_viewport_size({"width": 390, "height": 844})
    login(page)
    page.goto("/?view=learn&scope=civil")
    section = page.get_by_role("button", name=re.compile("^Договорное право"))
    expect(section).to_have_attribute("aria-expanded", "false")
    section.click()
    expect(section).to_have_attribute("aria-expanded", "true")
    page.get_by_role("button", name="Открыть тему: Оферта и акцепт", exact=True).click()
    expect(page.get_by_role("heading", name="Оферта и акцепт", exact=True)).to_be_visible()
    path = page.get_by_role("navigation", name="Путь к теме")
    expect(path.get_by_role("button", name="Договорное право", exact=True)).to_be_visible()
    page.get_by_role("navigation", name="Содержание темы").get_by_role("link", name="Практический пример").click()
    expect(page).to_have_url(re.compile(r"#study-example$"))
    expect(page.locator("#study-example")).to_be_in_viewport()
    page.reload()
    expect(page.get_by_role("heading", name="Оферта и акцепт", exact=True)).to_be_visible()
    expect(page.locator("#study-norms a")).to_have_count(0)
    page.get_by_role("button", name="К оглавлению", exact=True).click()
    expect(section).to_have_attribute("aria-expanded", "true")
    page.reload()
    expect(section).to_have_attribute("aria-expanded", "true")
    page.get_by_role("button", name="Открыть тему: Оферта и акцепт", exact=True).click()
    page.go_back()
    expect(section).to_have_attribute("aria-expanded", "true")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")


def test_curriculum_completion_survives_reload_without_extra_xp(page, login):
    login(page)
    page.goto("/?view=lesson&scope=civil&item=offer")
    expect(page.get_by_role("heading", name="Оферта и акцепт", exact=True)).to_be_visible()
    page.get_by_role("button", name="Завершить урок", exact=True).click()
    expect(page.get_by_role("button", name="Урок пройден", exact=True)).to_be_disabled()
    xp = page.locator(".xp-stat").inner_text()
    page.reload()
    expect(page.get_by_role("button", name="Урок пройден", exact=True)).to_be_disabled()
    expect(page.locator(".xp-stat")).to_have_text(xp)
    page.get_by_role("button", name="К оглавлению", exact=True).click()
    expect(page.get_by_role("button", name=re.compile("^Договорное право"))).to_contain_text("1 из 1 тем пройдено")
