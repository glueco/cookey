"""Cross-language PoP v1 parity test.

Validates glueco_sdk's canonical building and Ed25519 signing against
sdks/test-vectors.json — the shared wire contract with the gateway and
the TypeScript SDK.

Run: pip install -e . pytest && pytest tests/
"""
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from glueco_sdk.keys import sign, verify, public_key_from_seed  # noqa: E402
from glueco_sdk.pop import build_canonical_request  # noqa: E402

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "test-vectors.json").read_text()
)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def test_public_key_derivation():
    seed = bytes.fromhex(VECTORS["seedHex"])
    derived = base64.b64encode(public_key_from_seed(seed)).decode()
    assert derived == VECTORS["publicKeyBase64"]


def test_vectors():
    import hashlib

    seed = bytes.fromhex(VECTORS["seedHex"])
    public_key = base64.b64decode(VECTORS["publicKeyBase64"])

    for vector in VECTORS["vectors"]:
        body_hash = _b64url(hashlib.sha256(vector["body"].encode()).digest())
        assert body_hash == vector["bodyHashBase64Url"], vector["name"]

        canonical = build_canonical_request(
            method=vector["method"],
            path_with_query=vector["pathWithQuery"],
            app_id=vector["appId"],
            ts=vector["ts"],
            nonce=vector["nonce"],
            body_hash=body_hash,
        )
        assert canonical == vector["canonicalRequest"], vector["name"]

        # Our signature must verify AND the fixture signature must verify —
        # Ed25519 is deterministic, so they should be byte-identical
        signature = sign(seed, canonical.encode())
        assert _b64url(signature) == vector["signatureBase64Url"], vector["name"]
        assert verify(public_key, canonical.encode(), signature)


if __name__ == "__main__":
    test_public_key_derivation()
    test_vectors()
    print("all python vectors OK")
