from app.bracket import _seed_order, generate_single_elimination


def test_seed_order_for_power_of_two_sizes():
    assert _seed_order(2) == [1, 2]
    assert _seed_order(4) == [1, 4, 2, 3]
    assert _seed_order(8) == [1, 8, 4, 5, 2, 7, 3, 6]


def test_generate_single_elimination_for_exact_power_of_two():
    matches = generate_single_elimination([10, 20, 30, 40])

    assert matches[(1, 1)].team1_id == 10
    assert matches[(1, 1)].team2_id == 40
    assert matches[(1, 1)].status == "ready"
    assert matches[(1, 1)].winner_id is None
    assert matches[(1, 1)].winner_next == (2, 1, 1)

    assert matches[(1, 2)].team1_id == 20
    assert matches[(1, 2)].team2_id == 30
    assert matches[(1, 2)].status == "ready"
    assert matches[(1, 2)].winner_next == (2, 1, 2)

    assert matches[(2, 1)].team1_id is None
    assert matches[(2, 1)].team2_id is None
    assert matches[(2, 1)].status == "pending"
    assert matches[(2, 1)].winner_next is None


def test_generate_single_elimination_with_one_bye():
    matches = generate_single_elimination([10, 20, 30])

    assert matches[(1, 1)].team1_id == 10
    assert matches[(1, 1)].team2_id is None
    assert matches[(1, 1)].status == "complete"
    assert matches[(1, 1)].winner_id == 10

    assert matches[(1, 2)].team1_id == 20
    assert matches[(1, 2)].team2_id == 30
    assert matches[(1, 2)].status == "ready"

    assert matches[(2, 1)].team1_id == 10
    assert matches[(2, 1)].team2_id is None
    assert matches[(2, 1)].status == "pending"


def test_generate_single_elimination_with_cascading_byes():
    matches = generate_single_elimination([10, 20, 30, 40, 50])

    assert matches[(1, 1)].status == "complete"
    assert matches[(1, 1)].winner_id == 10
    assert matches[(1, 2)].status == "ready"
    assert matches[(1, 3)].status == "complete"
    assert matches[(1, 3)].winner_id == 20
    assert matches[(1, 4)].status == "complete"
    assert matches[(1, 4)].winner_id == 30

    assert matches[(2, 1)].team1_id == 10
    assert matches[(2, 1)].team2_id is None
    assert matches[(2, 1)].status == "pending"

    assert matches[(2, 2)].team1_id == 20
    assert matches[(2, 2)].team2_id == 30
    assert matches[(2, 2)].status == "ready"


def test_generate_single_elimination_with_two_non_cascading_byes():
    matches = generate_single_elimination([10, 20, 30, 40, 50, 60])

    assert matches[(1, 1)].status == "complete"
    assert matches[(1, 1)].winner_id == 10
    assert matches[(1, 2)].status == "ready"
    assert matches[(1, 3)].status == "complete"
    assert matches[(1, 3)].winner_id == 20
    assert matches[(1, 4)].status == "ready"

    assert matches[(2, 1)].team1_id == 10
    assert matches[(2, 1)].team2_id is None
    assert matches[(2, 1)].status == "pending"

    assert matches[(2, 2)].team1_id == 20
    assert matches[(2, 2)].team2_id is None
    assert matches[(2, 2)].status == "pending"
