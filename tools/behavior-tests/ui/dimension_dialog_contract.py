"""Bounded visible custom-dimension dialog contract and synthetic text inputs."""

import re

from protocol import ProtocolError

ALGORITHM = "ui.map_dimension_dialog.v1"
TEXT_PROFILES = {
    "default": {"caption": "Custom Map Size", "horizontal": "Horizontal", "vertical": "Vertical"},
    "alternate": {"caption": "Alternate Dimensions", "horizontal": "Meridian", "vertical": "Parallel"},
    "core": {"caption": "Custom Map Size", "common_caption": "Core Dimensions", "horizontal": "Horizontal", "vertical": "Vertical"},
    "both": {"caption": "Expansion Dimensions", "common_caption": "Core Dimensions", "horizontal": "Meridian", "vertical": "Parallel"},
}
# Installed-data profile, independent of the dialog's observed output values.
# Synthetic candidate names replace installed choice text; ordinal navigation
# and the source horizontal-half-width/height context remain equivalent.
WORLD_DIMENSIONS = ((24, 48), (32, 64), (40, 80), (44, 90), (64, 128))
LABEL_COUNT = 1131
HORIZONTAL_LABEL = 1090
VERTICAL_LABEL = 1091
SOURCE_HASHES = {
    "alphax.txt": "bb01e3ac23793da0a46713f4851d65e63b599c24aef8300ffe45e7e57b332c42",
    "xscript.txt": "35d805af442bec0f614311fcb1ab7c95b1bf2b5b500d892a69de177b548494fa",
    "labels.txt": "b6b7057a9f96a29a77e89da143d38e34bec5d93d651ac798b3c27d4efdab2009",
    "script.txt": "eaf44ddeb066952cfb4f441a64c5f3517c1e8c59e0bc3bdf72e10fd80a2fc87d",
}


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {"route", "prior_preset", "text_profile"}
            or value["route"] not in ("random", "custom")
            or not isinstance(value["text_profile"], str) or value["text_profile"] not in TEXT_PROFILES
            or not (value["prior_preset"] is None
                    or type(value["prior_preset"]) is int and 0 <= value["prior_preset"] <= 4)):
        raise ProtocolError("dimension dialog requires random/custom route, null or 0..4 prior preset and known text profile")


def validate_output(value):
    if not isinstance(value, dict) or set(value) != {"caption", "labels", "values", "buttons"}:
        raise ProtocolError("invalid dimension dialog output fields")
    if (not isinstance(value["caption"], str) or not value["caption"]
            or "|" in value["caption"] or "\n" in value["caption"]):
        raise ProtocolError("missing dimension dialog caption")
    for key in ("labels", "values", "buttons"):
        if (not isinstance(value[key], list) or len(value[key]) != 2
                or any(not isinstance(item, str) or not item or "|" in item or "\n" in item
                       for item in value[key])):
            raise ProtocolError("invalid dimension dialog " + key)
    if any(not re.fullmatch(r"[0-9]+", item) for item in value["values"]):
        raise ProtocolError("unreadable raw dimension input text")


def parse_candidate(output, cases):
    if re.search(r"TEST FAILED|Unhandled exception|\bGSE\w*Error\b", output):
        raise ProtocolError("dimension candidate reported a runtime/test failure")
    rows, completed = [], []
    for line in output.splitlines():
        match = re.search(r"(?:^|\] )(DIMENSION_(?:RESULT|DONE)\|.*)$", line)
        if not match:
            continue
        fields = match[1].split("|")
        if fields[0] == "DIMENSION_DONE":
            if len(fields) != 2 or not fields[1].isdigit():
                raise ProtocolError("invalid dimension completion marker")
            completed.append(int(fields[1]))
            continue
        if len(fields) != 9 or completed:
            raise ProtocolError("invalid or late dimension result marker")
        value = {"caption": fields[2], "labels": fields[3:5], "values": fields[5:7], "buttons": fields[7:9]}
        validate_output(value)
        rows.append({"id": fields[1], "status": "ok", "output": value})
    if completed != [len(cases)] or [row["id"] for row in rows] != [case["id"] for case in cases]:
        raise ProtocolError("missing, duplicate, unknown or reordered dimension cases/completion")
    return rows
