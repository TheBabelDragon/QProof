"""Circuit JSON format validation and round-trip."""

import pytest

from qproof import Circuit, circuit_from_dict, circuit_to_dict, validate_circuit_dict
from qproof.circuit_spec import CircuitSpecError


def test_valid_bell_spec():
    data = {
        "format_version": "1.0.0",
        "n_qubits": 2,
        "gates": [
            {"gate": "H", "qubits": [0]},
            {"gate": "CNOT", "qubits": [0, 1]},
        ],
    }
    assert validate_circuit_dict(data) == []
    circ, init = circuit_from_dict(data)
    assert circ.n_qubits == 2
    assert circ.gate_count == 2
    assert init is None
    state = circ.run()
    assert abs(state.probabilities()[0] - 0.5) < 1e-10


def test_round_trip():
    circ = Circuit(2).h(0).cx(0, 1)
    d = circuit_to_dict(circ)
    circ2, _ = circuit_from_dict(d)
    assert circ2.to_spec() == circ.to_spec()


def test_unknown_gate():
    data = {"n_qubits": 1, "gates": [{"gate": "FOO", "qubits": [0]}]}
    errs = validate_circuit_dict(data)
    assert any("unknown" in e for e in errs)


def test_unsupported_gate():
    data = {"n_qubits": 3, "gates": [{"gate": "TOFFOLI", "qubits": [0, 1, 2]}]}
    # TOFFOLI arity mismatch in catalog path — listed as unsupported
    errs = validate_circuit_dict(data)
    assert errs


def test_qubit_out_of_range():
    data = {"n_qubits": 1, "gates": [{"gate": "H", "qubits": [5]}]}
    errs = validate_circuit_dict(data)
    assert any("out of range" in e for e in errs)


def test_cnot_same_qubits():
    data = {"n_qubits": 2, "gates": [{"gate": "CNOT", "qubits": [0, 0]}]}
    errs = validate_circuit_dict(data)
    assert any("differ" in e for e in errs)


def test_rx_requires_theta():
    data = {"n_qubits": 1, "gates": [{"gate": "RX", "qubits": [0]}]}
    errs = validate_circuit_dict(data)
    assert any("theta" in e for e in errs)


def test_rx_with_theta():
    data = {
        "n_qubits": 1,
        "gates": [{"gate": "RX", "qubits": [0], "theta": 3.141592653589793}],
    }
    assert validate_circuit_dict(data) == []
    circ, _ = circuit_from_dict(data)
    state = circ.run()
    assert abs(state.probabilities()[1] - 1.0) < 1e-10


def test_max_qubits():
    data = {"n_qubits": 99, "gates": []}
    errs = validate_circuit_dict(data)
    assert any("MAX_QUBITS" in e for e in errs)


def test_circuit_from_dict_raises():
    with pytest.raises(CircuitSpecError):
        circuit_from_dict({"n_qubits": 1, "gates": [{"gate": "NOPE", "qubits": [0]}]})


def test_cx_alias():
    data = {
        "n_qubits": 2,
        "gates": [{"gate": "H", "qubits": [0]}, {"gate": "CX", "qubits": [0, 1]}],
    }
    assert validate_circuit_dict(data) == []
    circ, _ = circuit_from_dict(data)
    assert circ.gates[1].kind.value == "CNOT"
