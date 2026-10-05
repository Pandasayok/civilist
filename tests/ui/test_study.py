"""Read these tests as manual test cases: action, action, expected result."""
import re
from uuid import uuid4

import pytest
from playwright.sync_api import Page, expect


def xp_label(page: Page):
    return page.get_by_text(re.compile(r"^\d+ XP$"))


def api_status(page: Page, path: str):
    # Browser fetch uses the same cookie rules and session as the application.
    return page.evaluate("async (path) => (await fetch(path)).status", path)


def test_wrong_code_keeps_the_app_closed(page: Page):
    page.goto("/")
    expect(page.get_by_role("heading", name="Продолжим учиться")).to_be_visible()
    page.get_by_label("Код доступа").fill("ui-test-invalid-access-code")
    page.get_by_role("button", name="Войти", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("Код не найден")
    expect(page.get_by_role("button", name="Войти", exact=True)).to_be_enabled()
    expect(page).to_have_url(re.compile(r"/login$"))
    assert api_status(page, "/api/bootstrap") == 401


def test_learner_cannot_open_administration(page: Page, login):
    login(page)
    expect(page.get_by_role("button", name="Администрирование", exact=True)).to_have_count(0)
    page.goto("/?view=admin")
    expect(page.get_by_role("heading", name="Доступ администратора")).to_be_visible()
    expect(page.get_by_role("button", name="Добавить", exact=True)).to_have_count(0)
    assert api_status(page, "/api/admin") == 403


def choose_answer(page: Page, question):
    """Use the seed as test data; these checks validate UI and saving, not legal accuracy."""
    panel = page.locator(".quiz-panel")
    kind = question["type"]
    if kind == "short":
        panel.get_by_role("textbox", name="Твой письменный ответ").fill(question["model"])
    elif kind in {"single", "multiple"}:
        role = "radio" if kind == "single" else "checkbox"
        for index in question["answer"]:
            panel.get_by_role(role).nth(index).click()
    elif kind == "matching":
        for left, index in zip(question["left"], question["answer"], strict=True):
            panel.get_by_role("combobox", name=f"Определение для {left}").click()
            page.get_by_role("option", name=question["options"][index], exact=True).click()
    elif kind == "sequence":
        for index in question["answer"]:
            panel.locator(".sequence-options").get_by_role("button", name=question["options"][index], exact=True).click()
    else:
        pytest.fail(f"Добавь UI-проверку нового типа задания: {kind}")


def test_quiz_xp_survives_reload_and_another_session(page: Page, login, seed_questions, new_context):
    login(page)
    before = int(xp_label(page).inner_text().split()[0])
    page.get_by_role("button", name="Начать тест", exact=True).click()
    expect(page.get_by_role("heading", name="Проверим знания")).to_be_visible()

    # The daily order varies. Find the current question by its visible title.
    for _ in range(10):
        panel = page.locator(".quiz-panel")
        question = seed_questions[panel.get_by_role("heading", level=2).inner_text()]
        choose_answer(page, question)
        submit = "Сохранить и сравнить" if question["type"] == "short" else "Проверить ответ"
        panel.get_by_role("button", name=submit, exact=True).click()
        expected = "Сравни с эталоном" if question["type"] == "short" else "Верно"
        expect(panel.get_by_role("status").get_by_role("heading")).to_contain_text(expected)
        result = panel.get_by_role("button", name="Посмотреть результат", exact=True)
        if result.count():
            result.click()
            break
        panel.get_by_role("button", name="Следующее задание", exact=True).click()

    expect(page.get_by_role("heading", name="Тренировка завершена")).to_be_visible()
    earned = int(re.search(r"\+(\d+) XP", page.locator(".finish-summary").inner_text())[1])
    assert earned > 0
    expected_xp = f"{before + earned} XP"
    expect(xp_label(page)).to_have_text(expected_xp)
    page.reload()
    expect(xp_label(page)).to_have_text(expected_xp)

    # A new context has no previous cookies or browser storage.
    second_page = new_context().new_page()
    login(second_page)
    expect(xp_label(second_page)).to_have_text(expected_xp)


def test_profile_settings_persist_and_logout_closes_access(page: Page, login):
    login(page)
    page.get_by_role("button", name="Открыть профиль", exact=True).click()
    page.get_by_role("button", name="Настроить", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Имя", exact=True).fill("Тестовый ученик")
    dialog.get_by_label("Цель на день, XP", exact=True).fill("60")
    dialog.get_by_role("button", name="Сохранить", exact=True).click()
    expect(dialog).not_to_be_visible()
    page.reload()
    expect(page.get_by_role("heading", name="Тестовый ученик", exact=True)).to_be_visible()
    page.get_by_role("button", name="Настроить", exact=True).click()
    expect(dialog.get_by_label("Цель на день, XP", exact=True)).to_have_value("60")
    dialog.get_by_role("button", name="Выйти из аккаунта", exact=True).click()
    expect(page.get_by_role("heading", name="Продолжим учиться")).to_be_visible()
    assert api_status(page, "/api/bootstrap") == 401
    page.goto("/?view=profile")
    expect(page.get_by_role("heading", name="Продолжим учиться")).to_be_visible()


def test_admin_saves_a_draft_that_the_learner_cannot_see(page: Page, login, new_context):
    login(page, "admin")
    page.get_by_role("button", name="Администрирование", exact=True).click()
    expect(page.get_by_role("heading", name="Библиотека материалов")).to_be_visible()
    page.get_by_role("button", name="Добавить", exact=True).click()
    dialog = page.get_by_role("dialog")
    title = f"Локальный UI-черновик {uuid4().hex[:8]}"
    values = {
        "Название": title,
        "Номер и наименование акта": "UI-TEST: вымышленные данные для проверки интерфейса",
        "Суть": "Временный материал браузерного теста.",
        "Основной вывод": "Проверяем сохранение черновика, правовых выводов здесь нет.",
        "Почему важно": "Черновик должен быть доступен только администратору.",
        "Нормы для исследования": "Тестовые данные, не учебный материал.",
        "Наименование источника": "ВС РФ: адрес для проверки поля формы",
        "Ссылка на источник": "https://www.vsrf.ru/",
    }
    for label, value in values.items():
        dialog.get_by_label(label, exact=True).fill(value)
    dialog.get_by_role("button", name="Сохранить черновик", exact=True).click()
    expect(dialog).not_to_be_visible()
    page.reload()
    row = page.locator(".admin-row").filter(has=page.get_by_role("heading", name=title, exact=True))
    expect(row).to_be_visible()
    expect(row.get_by_text("Черновик", exact=True)).to_be_visible()

    learner_page = new_context().new_page()
    login(learner_page)
    learner_page.goto("/?view=practice")
    expect(learner_page.get_by_role("heading", name="Судебная практика")).to_be_visible()
    expect(learner_page.get_by_role("heading", name=title, exact=True)).to_have_count(0)


@pytest.mark.browser_context_args(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
def test_mobile_navigation_opens_documents(page: Page, login):
    login(page)
    navigation = page.get_by_role("navigation", name="Основные разделы")
    expect(navigation).to_be_visible()
    navigation.get_by_role("button", name="Документы", exact=True).click()
    expect(page.get_by_role("heading", name="Библиотека документов")).to_be_visible()
    expect(navigation.get_by_role("button", name="Документы", exact=True)).to_have_attribute("aria-current", "page")

def test_empty_code_keeps_the_app_closed(page: Page):
    page.goto("/")

    code_input = page.get_by_label("Код доступа")
    expect(code_input).to_be_empty()

    page.get_by_role("button", name="Войти", exact=True).click()

    expect(code_input).to_be_focused()
    assert code_input.evaluate("element => element.validity.valueMissing")

    expect(page).to_have_url(re.compile(r"/login$"))
    assert api_status(page, "/api/bootstrap") == 401