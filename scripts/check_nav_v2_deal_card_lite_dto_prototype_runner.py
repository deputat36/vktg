from __future__ import annotations

import re
import sys

import check_nav_v2_deal_card_lite_dto_prototype as contract


def anchored_keys(text: str) -> set[str]:
    return set(re.findall(r"(?m)^\s{4}'([a-z][a-z0-9_]*)'\s*,", text, flags=re.I))


contract.keys = anchored_keys
sys.exit(contract.main())
