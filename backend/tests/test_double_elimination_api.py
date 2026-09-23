from collections import Counter

import pytest
from sqlmodel import select

from app.models import CorrectionLog


def _generate(client, team_count, format="double"):
    tournament = client.post("/tournaments", json={"name": "Double Cup"}).json()
    for seed in range(1, team_count + 1):
        team = client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": f"Team {seed}", "seed": seed},
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
    response = client.post(
        f"/tournaments/{tournament['id']}/bracket/generate", json={"format": format}
    )
    assert response.status_code == 201, response.json()
    return tournament["id"], {
        (m["bracket"], m["round"], m["position"]): m for m in response.json()
    }


def _get(client, match_id):
    return client.get(f"/matches/{match_id}").json()


def _complete(client, match_id, team1_wins=True):
    match = _get(client, match_id)
    scores = (21, 10) if team1_wins else (10, 21)
    response = client.patch(
        f"/matches/{match_id}/score",
        json={
            "team1_score": scores[0],
            "team2_score": scores[1],
            "version": match["version"],
            "complete": True,
        },
    )
    assert response.status_code == 200, response.json()
    return response.json()


def test_completing_a_winners_match_drops_the_loser_into_the_losers_bracket(client):
    _, matches = _generate(client, 4)
    semifinal = matches[("winners", 1, 1)]

    _complete(client, semifinal["id"])

    losers_match = _get(client, matches[("losers", 1, 1)]["id"])
    assert losers_match["team1_id"] == semifinal["team2_id"]
    assert losers_match["status"] == "pending"

    _complete(client, matches[("winners", 1, 2)]["id"], team1_wins=False)

    losers_match = _get(client, matches[("losers", 1, 1)]["id"])
    assert losers_match["team2_id"] == matches[("winners", 1, 2)]["team1_id"]
    assert losers_match["status"] == "ready"


def test_a_loser_dropping_into_a_bye_losers_match_advances_automatically(client):
    _, matches = _generate(client, 5)
    first_round = matches[("winners", 1, 2)]

    _complete(client, first_round["id"])
    dropped = first_round["team2_id"]

    bye_match = _get(client, matches[("losers", 1, 1)]["id"])
    assert bye_match["status"] == "complete"
    assert bye_match["winner_id"] == dropped
    assert _get(client, matches[("losers", 2, 1)]["id"])["team1_id"] == dropped

    second_round = _complete(client, matches[("winners", 2, 1)]["id"])
    dropped_again = second_round["team2_id"]

    second_bye = _get(client, matches[("losers", 2, 2)]["id"])
    assert second_bye["status"] == "complete"
    assert second_bye["winner_id"] == dropped_again
    losers_round_3 = _get(client, matches[("losers", 3, 1)]["id"])
    assert dropped_again in (losers_round_3["team1_id"], losers_round_3["team2_id"])


def _bracket(client, tournament_id):
    [bracket] = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    return client.get(f"/playoff-brackets/{bracket['id']}/matches").json()


def _play_until_grand_final(client, tournament_id):
    """Complete every playable match (team1 wins) until only the grand final is left."""
    while True:
        playable = [
            m
            for m in _bracket(client, tournament_id)
            if m["status"] == "ready" and m["bracket"] != "grand_final"
        ]
        if not playable:
            break
        for match in playable:
            _complete(client, match["id"])
    return next(
        m
        for m in _bracket(client, tournament_id)
        if m["bracket"] == "grand_final" and m["round"] == 1
    )


def _grand_finals(client, tournament_id):
    return sorted(
        (m for m in _bracket(client, tournament_id) if m["bracket"] == "grand_final"),
        key=lambda m: m["round"],
    )


def test_winners_champion_taking_grand_final_one_decides_the_tournament(client):
    tournament_id, _ = _generate(client, 8)
    grand_final = _play_until_grand_final(client, tournament_id)
    assert grand_final["status"] == "ready"

    _complete(client, grand_final["id"], team1_wins=True)

    finals = _grand_finals(client, tournament_id)
    assert len(finals) == 1
    assert finals[0]["winner_id"] == grand_final["team1_id"]


def test_losers_champion_taking_grand_final_one_forces_a_reset_match(client):
    tournament_id, _ = _generate(client, 8)
    grand_final = _play_until_grand_final(client, tournament_id)
    winners_champion, losers_champion = grand_final["team1_id"], grand_final["team2_id"]

    _complete(client, grand_final["id"], team1_wins=False)

    finals = _grand_finals(client, tournament_id)
    assert len(finals) == 2
    reset = finals[1]
    assert (reset["round"], reset["position"]) == (2, 1)
    assert (reset["team1_id"], reset["team2_id"]) == (winners_champion, losers_champion)
    assert reset["status"] == "ready"

    _complete(client, reset["id"], team1_wins=False)

    finals = _grand_finals(client, tournament_id)
    assert len(finals) == 2
    assert finals[1]["winner_id"] == losers_champion


@pytest.mark.parametrize("team_count", [2, 3, 5, 6, 7, 9, 12])
def test_every_team_is_eliminated_after_exactly_two_losses(client, team_count):
    tournament_id, _ = _generate(client, team_count)
    grand_final = _play_until_grand_final(client, tournament_id)

    stuck = [m for m in _bracket(client, tournament_id) if m["status"] != "complete"]
    assert [m["bracket"] for m in stuck] == ["grand_final"]
    assert grand_final["status"] == "ready"

    _complete(client, grand_final["id"], team1_wins=True)

    losses = Counter()
    for match in _bracket(client, tournament_id):
        if match["team1_id"] is not None and match["team2_id"] is not None:
            loser = match["team2_id"] if match["winner_id"] == match["team1_id"] else match["team1_id"]
            losses[loser] += 1
    champion = grand_final["team1_id"]
    assert losses[champion] == 0
    assert len(losses) == team_count - 1
    assert set(losses.values()) == {2}


def _correct(client, match_id, team1_wins):
    match = _get(client, match_id)
    scores = (21, 10) if team1_wins else (10, 21)
    response = client.patch(
        f"/matches/{match_id}/correct",
        json={"team1_score": scores[0], "team2_score": scores[1], "version": match["version"]},
    )
    assert response.status_code == 200, response.json()
    return response.json()


def test_correcting_a_winners_match_cascades_down_the_losers_chain(client):
    _, matches = _generate(client, 4)
    first = matches[("winners", 1, 1)]
    _complete(client, first["id"])
    _complete(client, matches[("winners", 1, 2)]["id"])
    _complete(client, matches[("losers", 1, 1)]["id"])
    assert _get(client, matches[("losers", 2, 1)]["id"])["team1_id"] == first["team2_id"]

    result = _correct(client, first["id"], team1_wins=False)

    reset_ids = {m["id"] for m in result["reset_matches"]}
    assert reset_ids == {
        matches[("winners", 2, 1)]["id"],
        matches[("losers", 1, 1)]["id"],
        matches[("losers", 2, 1)]["id"],
    }
    losers_round_1 = _get(client, matches[("losers", 1, 1)]["id"])
    assert losers_round_1["team1_id"] == first["team1_id"]
    assert losers_round_1["winner_id"] is None
    assert losers_round_1["status"] == "ready"
    losers_final = _get(client, matches[("losers", 2, 1)]["id"])
    assert losers_final["team1_id"] is None
    assert losers_final["status"] == "pending"
    winners_final = _get(client, matches[("winners", 2, 1)]["id"])
    assert winners_final["team1_id"] == first["team2_id"]


def test_correcting_into_a_losers_bye_re_advances_the_new_loser(client):
    _, matches = _generate(client, 5)
    first = matches[("winners", 1, 2)]
    _complete(client, first["id"])

    _correct(client, first["id"], team1_wins=False)

    bye_match = _get(client, matches[("losers", 1, 1)]["id"])
    assert bye_match["status"] == "complete"
    assert bye_match["winner_id"] == first["team1_id"]
    assert _get(client, matches[("losers", 2, 1)]["id"])["team1_id"] == first["team1_id"]


def _play_to_bracket_reset(client, team_count=4):
    tournament_id, matches = _generate(client, team_count)
    grand_final = _play_until_grand_final(client, tournament_id)
    _complete(client, grand_final["id"], team1_wins=False)
    reset = _grand_finals(client, tournament_id)[1]
    return tournament_id, matches, grand_final, reset


def test_a_correction_that_resets_grand_final_one_removes_the_reset_match(client):
    tournament_id, matches, grand_final, reset = _play_to_bracket_reset(client)

    result = _correct(client, matches[("losers", 2, 1)]["id"], team1_wins=False)

    assert reset["id"] in {m["id"] for m in result["reset_matches"]}
    finals = _grand_finals(client, tournament_id)
    assert [f["id"] for f in finals] == [grand_final["id"]]
    assert finals[0]["winner_id"] is None


def test_correcting_grand_final_one_to_the_winners_champion_removes_the_reset_match(client):
    tournament_id, _, grand_final, reset = _play_to_bracket_reset(client)

    result = _correct(client, grand_final["id"], team1_wins=True)

    assert [m["id"] for m in result["reset_matches"]] == [reset["id"]]
    assert [f["id"] for f in _grand_finals(client, tournament_id)] == [grand_final["id"]]


def test_removing_the_reset_match_also_removes_its_correction_history(client, session):
    tournament_id, _, grand_final, reset = _play_to_bracket_reset(client)
    _complete(client, reset["id"])
    _correct(client, reset["id"], team1_wins=False)

    _correct(client, grand_final["id"], team1_wins=True)

    logs = session.exec(select(CorrectionLog)).all()
    assert [log.match_id for log in logs] == [grand_final["id"]]


def test_correcting_grand_final_one_to_the_losers_champion_creates_the_reset_match(client):
    tournament_id, _ = _generate(client, 4)
    grand_final = _play_until_grand_final(client, tournament_id)
    _complete(client, grand_final["id"], team1_wins=True)

    _correct(client, grand_final["id"], team1_wins=False)

    finals = _grand_finals(client, tournament_id)
    assert len(finals) == 2
    assert finals[1]["status"] == "ready"
    assert (finals[1]["team1_id"], finals[1]["team2_id"]) == (
        grand_final["team1_id"],
        grand_final["team2_id"],
    )


def test_generating_double_elimination_persists_all_three_sections_with_links(client):
    tournament_id, matches = _generate(client, 4)

    assert sorted(matches) == sorted(
        [
            ("winners", 1, 1),
            ("winners", 1, 2),
            ("winners", 2, 1),
            ("losers", 1, 1),
            ("losers", 2, 1),
            ("grand_final", 1, 1),
        ]
    )
    semifinal = matches[("winners", 1, 1)]
    assert semifinal["loser_next_match_id"] == matches[("losers", 1, 1)]["id"]
    assert semifinal["loser_next_slot"] == 1
    losers_final = matches[("losers", 2, 1)]
    assert losers_final["winner_next_match_id"] == matches[("grand_final", 1, 1)]["id"]
    assert losers_final["winner_next_slot"] == 2
    assert client.get(f"/tournaments/{tournament_id}").json()["format"] == "double"


def test_generating_without_a_format_is_still_single_elimination(client):
    tournament = client.post("/tournaments", json={"name": "Single Cup"}).json()
    for seed in (1, 2):
        team = client.post(
            f"/tournaments/{tournament['id']}/teams", json={"name": f"T{seed}", "seed": seed}
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": "P"})

    response = client.post(f"/tournaments/{tournament['id']}/bracket/generate")

    assert response.status_code == 201
    assert [m["bracket"] for m in response.json()] == ["winners"]
    assert all(m["loser_next_match_id"] is None for m in response.json())
    assert client.get(f"/tournaments/{tournament['id']}").json()["format"] == "single"
