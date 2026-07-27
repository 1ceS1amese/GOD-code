from __future__ import annotations

from collections.abc import Mapping

type JsonValue = str | int | float | bool | None | JsonObject | JsonList
type JsonObject = dict[str, JsonValue]
type JsonList = list[JsonValue]
type JsonMapping = Mapping[str, JsonValue]

Message = JsonObject
Messages = list[Message]

TranscriptEntry = JsonObject
TranscriptEntries = list[TranscriptEntry]
