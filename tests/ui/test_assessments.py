"""A real course test: saved answers, grading, repeat rewards and section gate."""
import re
from uuid import uuid4
from urllib.parse import quote, urlsplit

from playwright.sync_api import expect
from test_study import choose_answer


def api(page, path, body=None):
    # Chromium treats loopback as trustworthy and sends the Secure session cookie.
    # APIRequestContext follows different HTTP cookie rules; exercise the browser session.
    result = page.evaluate("""async ({path, body}) => {
        const response = await fetch(path, body === null ? {} : {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        return {status: response.status, data: await response.json()};
    }""", {"path": path, "body": body})
    assert result["status"] == 200, result
    return result["data"]


def post(page, path, body):
    return api(page, path, body)


def test_topic_assessment_resume_and_result(page, login, seed_questions):
    login(page, "admin")
    page.goto("/?view=lesson&scope=civil&item=offer")
    page.get_by_role("button", name="Тест темы · 10 заданий", exact=True).click()
    expect(page.locator(".session-progress")).to_contain_text("Задание 1 из 10")
    expect(page.get_by_role("heading", name="Раздел не найден", exact=True)).to_have_count(0)
    panel = page.locator(".quiz-panel")
    first_question = seed_questions[panel.get_by_role("heading", level=2).inner_text()]
    choose_answer(page, first_question)
    page.get_by_role("button", name="Сохранить и дальше", exact=True).click()
    expect(page.locator(".session-progress")).to_contain_text("Задание 2 из 10")
    page.reload()
    expect(page.locator(".session-progress")).to_contain_text("Задание 2 из 10")
    # Inspect the saved first answer without guessing the randomized order.
    page.get_by_role("button", name="Задание 1, заполнено", exact=True).click()
    expect(panel.get_by_role("heading", level=2)).to_have_text(first_question["title"])
    page.get_by_role("button", name="Сохранить и дальше", exact=True).click()
    for number in range(2, 11):
        expect(page.locator(".session-progress")).to_contain_text(f"Задание {number} из 10")
        question = seed_questions[panel.get_by_role("heading", level=2).inner_text()]
        choose_answer(page, question)
        page.get_by_role("button", name="Завершить тест" if number == 10 else "Сохранить и дальше", exact=True).click()
    expect(page.get_by_role("heading", name="Тест сдан", exact=True)).to_be_visible()
    expect(page.locator(".assessment-result")).to_contain_text("9 из 9 · 100%")
    xp = page.locator(".xp-stat").inner_text()
    page.reload()
    expect(page.get_by_role("heading", name="Тест сдан", exact=True)).to_be_visible()
    expect(page.locator(".xp-stat")).to_have_text(xp)
    expect(page.locator(".assessment-result a")).to_have_count(0)


def test_section_final_is_locked_then_covers_all_topics_on_mobile(page, login):
    page.set_viewport_size({"width": 390, "height": 844})
    login(page, "admin")
    page.goto("/?view=learn&scope=civil&item=" + quote("Договорное право"))
    exam = page.locator(".study-section-exam").filter(has=page.get_by_role("heading", name="Итоговый тест: Договорное право", exact=True))
    expect(exam.get_by_role("button", name="Пройти итоговый тест", exact=True)).to_be_disabled()
    content = api(page, "/api/bootstrap")["content"]
    questions = {q["id"]: q for q in content["questions"]}
    for lesson in [l for l in content["lessons"] if l["topic"] == "Договорное право"]:
        post(page, "/api/activity", {"id": str(uuid4()), "kind": "lesson", "targetId": lesson["id"], "answer": True})
        attempt = post(page, "/api/assessment", {"action": "start", "mode": "topic", "branchId": "civil", "target": lesson["id"]})
        answers = {q["id"]: questions[q["id"]].get("model") if q["type"] == "short" else questions[q["id"]]["answer"] for q in attempt["questions"]}
        post(page, "/api/assessment", {"action": "finish", "id": attempt["id"], "answers": answers})
    page.reload()
    expect(exam.get_by_role("button", name="Пройти итоговый тест", exact=True)).to_be_enabled()
    exam.get_by_role("button", name="Пройти итоговый тест", exact=True).click()
    expect(page.locator(".session-progress")).to_contain_text("Задание 1 из 20")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    # Final completion is checked through UI, with input prepared by the same test data.
    from urllib.parse import urlsplit, parse_qs
    attempt_id = parse_qs(urlsplit(page.url).query)["attempt"][0]
    attempt = api(page, "/api/assessment?id=" + attempt_id)
    assert len({q["lessonId"] for q in attempt["questions"]}) == 6
    answers = {q["id"]: questions[q["id"]]["answer"] for q in attempt["questions"]}
    post(page, "/api/assessment", {"action": "save", "id": attempt_id, "answers": answers})
    page.reload()
    page.get_by_role("button", name="Задание 20, заполнено", exact=True).click()
    page.get_by_role("button", name="Завершить тест", exact=True).click()
    expect(page.get_by_role("heading", name="Тест сдан", exact=True)).to_be_visible()
    page.get_by_role("button", name="К оглавлению", exact=True).click()
    expect(exam).to_contain_text("Раздел закрыт")
