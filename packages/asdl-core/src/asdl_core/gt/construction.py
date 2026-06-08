"""Production construction helpers for shared Graphite gateways."""

from __future__ import annotations

from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway


def build_gt_gateway() -> GtGateway:
    """Construct the production Graphite gateway for explicit gt workflows."""
    return RealGtGateway()
