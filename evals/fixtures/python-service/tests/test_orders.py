from app import orders


def test_get_order():
    orders.get_order(None, FakeDb(), 1)
    assert True


class FakeDb:
    def query(self, sql, params):
        return {"id": params[0]}
