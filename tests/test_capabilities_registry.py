"""Capability registry and experiment registry."""

from qproof import capability_manifest, get_experiment, list_experiments, run_experiment
from qproof.experiment import ExperimentStatus


def test_manifest_structure():
    m = capability_manifest()
    assert m["schema_version"]
    assert "H" in m["gates"]
    assert "CNOT" in m["gates"]
    assert m["simulator"]["max_qubits"] >= 1
    assert any(not b["available"] for b in m["execution_modes"] if b["id"] == "quantum_hardware")
    assert "bell-state-v1" in [e["id"] for e in m["examples"]]


def test_list_experiments():
    names = {e["name"] for e in list_experiments()}
    assert {"bell", "phase", "hadamard", "rx-pi"} <= names


def test_all_builtins_pass():
    for name in ("bell", "phase", "hadamard", "rx-pi"):
        kwargs = {"shots": 64, "seed": 1} if name == "bell" else {}
        report = run_experiment(get_experiment(name, **kwargs))
        assert report.status == ExperimentStatus.PASSED, (name, report.status)
