import pytest

from tests.helpers import create_tournament


def _tournament(client, team_count=0, best_of=None):
    """A confirmed tournament with `team_count` seeded teams (each with a player)."""
    tournament_id = create_tournament(client, "Series Cup")["id"]
    if best_of is not None:
        client.patch(f"/tournaments/{tournament_id}", json={"playoff_best_of": best_of})
    teams = []
    for seed in range(1, team_count + 1):
        team = client.post(
            f"/tournaments/{tournament_id}/teams", json={"name": f"Team {seed}", "seed": seed}
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
        teams.append(team["id"])
    return tournament_id, teams


def _bracket(client, tournament_id, format="single"):
    """Generate the bracket; returns matches keyed by (bracket, round, position)."""
    matches = client.post(
        f"/tournaments/{tournament_id}/bracket/generate", json={"format": format}
    ).json()
    return {(m["bracket"], m["round"], m["position"]): m for m in matches}


def _get(client, match_id):
    return client.get(f"/matches/{match_id}").json()


def _game(client, match_id, team1_score, team2_score, version=None):
    if version is None:
        version = _get(client, match_id)["version"]
    return client.post(
        f"/matches/{match_id}/games",
        json={"team1_score": team1_score, "team2_score": team2_score, "version": version},
    )


def test_a_series_is_played_game_by_game_and_decided_by_a_majority(client):
    tournament_id, teams = _tournament(client, team_count=4, best_of=3)
    matches = _bracket(client, tournament_id)
    semi = matches[("winners", 1, 1)]  # seed 1 vs seed 4
    final = matches[("winners", 2, 1)]

    first = _game(client, semi["id"], 21, 15)
    assert first.status_code == 201
    after_one = _get(client, semi["id"])
    assert (after_one["status"], after_one["team1_score"], after_one["team2_score"]) == (
        "in_progress",
        1,
        0,
    )
    assert _get(client, final["id"])["team1_id"] is None

    _game(client, semi["id"], 18, 21)
    _game(client, semi["id"], 21, 19)

    decided = _get(client, semi["id"])
    assert (decided["status"], decided["team1_score"], decided["team2_score"]) == ("complete", 2, 1)
    assert decided["winner_id"] == teams[0]
    assert _get(client, final["id"])["team1_id"] == teams[0]
    games = client.get(f"/matches/{semi['id']}/games").json()
    assert [(g["number"], g["team1_score"], g["team2_score"]) for g in games] == [
        (1, 21, 15),
        (2, 18, 21),
        (3, 21, 19),
    ]


def test_a_tied_game_or_stale_version_is_refused_and_nothing_is_recorded(client):
    tournament_id, _ = _tournament(client, team_count=2, best_of=3)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]

    tied = _game(client, final["id"], 20, 20)
    stale = _game(client, final["id"], 21, 10, version=final["version"] - 1)

    assert tied.status_code == 400
    assert stale.status_code == 409
    assert client.get(f"/matches/{final['id']}/games").json() == []
    assert _get(client, final["id"])["version"] == final["version"]


def test_a_single_game_match_takes_a_score_not_games(client):
    tournament_id, _ = _tournament(client, team_count=2)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]

    assert _game(client, final["id"], 21, 10).status_code == 400


def test_a_series_match_takes_games_not_a_single_score(client):
    tournament_id, _ = _tournament(client, team_count=2, best_of=3)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]

    response = client.patch(
        f"/matches/{final['id']}/score",
        json={"team1_score": 21, "team2_score": 10, "version": final["version"], "complete": True},
    )

    assert response.status_code == 400
    assert "best-of-3" in response.json()["detail"]
    assert _get(client, final["id"])["status"] == "ready"


def test_in_double_elimination_the_loser_drops_only_when_the_series_ends(client):
    tournament_id, teams = _tournament(client, team_count=4, best_of=3)
    matches = _bracket(client, tournament_id, format="double")
    first = matches[("winners", 1, 1)]
    losers_first = matches[("losers", 1, 1)]

    _game(client, first["id"], 10, 21)
    assert _get(client, losers_first["id"])["team1_id"] is None

    _game(client, first["id"], 21, 12)
    _game(client, first["id"], 21, 17)
    assert _get(client, losers_first["id"])["team1_id"] == teams[3]


def _edit_game(client, match_id, number, team1_score, team2_score):
    return client.patch(
        f"/matches/{match_id}/games/{number}",
        json={
            "team1_score": team1_score,
            "team2_score": team2_score,
            "version": _get(client, match_id)["version"],
        },
    )


def test_a_game_in_an_unfinished_series_can_be_fixed(client):
    tournament_id, _ = _tournament(client, team_count=4, best_of=5)
    matches = _bracket(client, tournament_id)
    semi, final = matches[("winners", 1, 1)], matches[("winners", 2, 1)]
    _game(client, semi["id"], 21, 15)
    _game(client, semi["id"], 15, 21)

    response = _edit_game(client, semi["id"], 2, 21, 19)

    assert response.status_code == 200
    series = _get(client, semi["id"])
    assert (series["status"], series["team1_score"], series["team2_score"]) == ("in_progress", 2, 0)
    assert _get(client, final["id"])["team1_id"] is None
    games = client.get(f"/matches/{semi['id']}/games").json()
    assert [(g["team1_score"], g["team2_score"]) for g in games] == [(21, 15), (21, 19)]


def test_fixing_a_game_can_decide_the_series(client):
    tournament_id, teams = _tournament(client, team_count=4, best_of=3)
    matches = _bracket(client, tournament_id)
    semi, final = matches[("winners", 1, 1)], matches[("winners", 2, 1)]
    _game(client, semi["id"], 21, 15)
    _game(client, semi["id"], 15, 21)

    _edit_game(client, semi["id"], 2, 21, 19)

    assert _get(client, semi["id"])["status"] == "complete"
    assert _get(client, final["id"])["team1_id"] == teams[0]


def test_a_decided_series_changes_only_through_a_correction(client):
    tournament_id, _ = _tournament(client, team_count=2, best_of=3)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]
    _game(client, final["id"], 21, 15)
    _game(client, final["id"], 21, 16)

    edit = _edit_game(client, final["id"], 1, 15, 21)
    extra = _game(client, final["id"], 21, 10)

    assert edit.status_code == 400 and "correct" in edit.json()["detail"]
    assert extra.status_code == 400
    assert len(client.get(f"/matches/{final['id']}/games").json()) == 2


def _games(client, match_id):
    return [(g["team1_score"], g["team2_score"]) for g in client.get(f"/matches/{match_id}/games").json()]


def test_correcting_a_series_that_flips_the_winner_cascades_and_clears_downstream_games(client):
    tournament_id, teams = _tournament(client, team_count=4, best_of=3)
    matches = _bracket(client, tournament_id)
    semi1, semi2, final = (
        matches[("winners", 1, 1)],
        matches[("winners", 1, 2)],
        matches[("winners", 2, 1)],
    )
    for semi in (semi1, semi2):
        _game(client, semi["id"], 21, 15)
        _game(client, semi["id"], 21, 16)
    _game(client, final["id"], 21, 18)  # the final is under way
    corrected_games = [
        {"team1_score": 15, "team2_score": 21},
        {"team1_score": 21, "team2_score": 16},
        {"team1_score": 17, "team2_score": 21},
    ]

    preview = client.post(f"/matches/{semi1['id']}/correct/preview", json={"games": corrected_games})
    response = client.patch(
        f"/matches/{semi1['id']}/correct",
        json={"games": corrected_games, "version": _get(client, semi1["id"])["version"]},
    )

    assert [m["id"] for m in preview.json()["reset_matches"]] == [final["id"]]
    assert response.status_code == 200
    corrected = _get(client, semi1["id"])
    assert (corrected["team1_score"], corrected["team2_score"], corrected["winner_id"]) == (
        1,
        2,
        teams[3],
    )
    assert _games(client, semi1["id"]) == [(15, 21), (21, 16), (17, 21)]
    reset_final = _get(client, final["id"])
    assert (reset_final["team1_id"], reset_final["status"]) == (teams[3], "ready")
    assert _games(client, final["id"]) == []


def test_a_correction_keeping_the_winner_just_rewrites_the_games(client):
    tournament_id, teams = _tournament(client, team_count=2, best_of=3)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]
    _game(client, final["id"], 21, 15)
    _game(client, final["id"], 21, 16)

    response = client.patch(
        f"/matches/{final['id']}/correct",
        json={
            "games": [
                {"team1_score": 21, "team2_score": 19},
                {"team1_score": 12, "team2_score": 21},
                {"team1_score": 21, "team2_score": 11},
            ],
            "version": _get(client, final["id"])["version"],
        },
    )

    assert response.status_code == 200 and response.json()["reset_matches"] == []
    assert _games(client, final["id"]) == [(21, 19), (12, 21), (21, 11)]
    assert _get(client, final["id"])["winner_id"] == teams[0]


@pytest.mark.parametrize(
    "games",
    [
        [(21, 15)],  # nobody reached a majority
        [(21, 15), (21, 16), (21, 10)],  # a game after the series was decided
        [(21, 15), (20, 20)],  # a tie
    ],
)
def test_a_corrected_series_must_be_a_complete_valid_series(client, games):
    tournament_id, _ = _tournament(client, team_count=2, best_of=3)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]
    _game(client, final["id"], 21, 15)
    _game(client, final["id"], 21, 16)

    response = client.patch(
        f"/matches/{final['id']}/correct",
        json={
            "games": [{"team1_score": a, "team2_score": b} for a, b in games],
            "version": _get(client, final["id"])["version"],
        },
    )

    assert response.status_code == 400
    assert _games(client, final["id"]) == [(21, 15), (21, 16)]


def test_deleting_a_tournament_deletes_its_games(client):
    tournament_id, _ = _tournament(client, team_count=2, best_of=3)
    final = _bracket(client, tournament_id)[("winners", 1, 1)]
    _game(client, final["id"], 21, 15)

    client.delete(f"/tournaments/{tournament_id}")
    # SQLite reuses the highest deleted ids, so a new bracket's match lands on the same id.
    new_tournament_id, _ = _tournament(client, team_count=2, best_of=3)
    new_final = _bracket(client, new_tournament_id)[("winners", 1, 1)]

    assert new_final["id"] == final["id"]
    assert _games(client, new_final["id"]) == []


def test_playoff_best_of_defaults_to_one(client):
    tournament_id, _ = _tournament(client)

    assert client.get(f"/tournaments/{tournament_id}").json()["playoff_best_of"] == 1


@pytest.mark.parametrize("value", [2, 4, 0, -1, 9])
def test_playoff_best_of_must_be_odd_and_one_to_seven(client, value):
    tournament_id, _ = _tournament(client)

    response = client.patch(f"/tournaments/{tournament_id}", json={"playoff_best_of": value})

    assert response.status_code == 422
    assert client.get(f"/tournaments/{tournament_id}").json()["playoff_best_of"] == 1


def test_playoff_best_of_is_locked_while_brackets_exist(client):
    tournament_id, _ = _tournament(client, team_count=4)
    client.post(f"/tournaments/{tournament_id}/bracket/generate")

    refused = client.patch(f"/tournaments/{tournament_id}", json={"playoff_best_of": 3})
    client.delete(f"/tournaments/{tournament_id}/playoff-brackets")
    allowed = client.patch(f"/tournaments/{tournament_id}", json={"playoff_best_of": 3})

    assert refused.status_code == 400 and "brackets" in refused.json()["detail"]
    assert allowed.status_code == 200 and allowed.json()["playoff_best_of"] == 3
