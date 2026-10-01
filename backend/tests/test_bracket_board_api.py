from tests.test_double_elimination_api import _complete, _generate


def _bracket_id(client, tournament_id):
    [bracket] = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    return bracket["id"]


def test_the_board_is_the_matches_and_the_dispatch_in_one_response(client):
    tournament_id, matches = _generate(client, 4)
    bracket_id = _bracket_id(client, tournament_id)
    # Some play, so there are scores, a queue and courts in use to compare.
    _complete(client, matches[("winners", 1, 1)]["id"])

    board = client.get(f"/playoff-brackets/{bracket_id}/board")

    assert board.status_code == 200
    body = board.json()
    assert body["matches"] == client.get(f"/playoff-brackets/{bracket_id}/matches").json()
    assert body["dispatch"] == client.get(f"/playoff-brackets/{bracket_id}/dispatch").json()


def test_the_board_of_an_unknown_bracket_is_not_found(client):
    assert client.get("/playoff-brackets/9999/board").status_code == 404


def test_an_unchanged_board_answers_a_conditional_request_with_an_empty_304(client):
    tournament_id, _ = _generate(client, 4)
    url = f"/playoff-brackets/{_bracket_id(client, tournament_id)}/board"
    etag = client.get(url).headers["etag"]

    again = client.get(url, headers={"If-None-Match": etag})

    assert again.status_code == 304
    assert again.content == b""


def test_a_score_changes_the_board_at_once_in_both_its_matches_and_its_queue(client):
    tournament_id, matches = _generate(client, 4)
    url = f"/playoff-brackets/{_bracket_id(client, tournament_id)}/board"
    before = client.get(url)
    first = matches[("winners", 1, 1)]

    _complete(client, first["id"])
    after = client.get(url, headers={"If-None-Match": before.headers["etag"]})

    assert after.status_code == 200
    scored = next(m for m in after.json()["matches"] if m["id"] == first["id"])
    assert scored["status"] == "complete"
    # The finished match left its court and the line moved on.
    assert first["id"] not in [c["match_id"] for c in after.json()["dispatch"]["courts"]]
    assert after.json()["dispatch"] != before.json()["dispatch"]
