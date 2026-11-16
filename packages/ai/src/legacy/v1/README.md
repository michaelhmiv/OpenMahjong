# Frozen AI policy v1

These are the AI sources from baseline `989927b`, with engine package imports
redirected to the frozen engine v1. They preserve unfinished legacy records.
Do not backport policy or rules fixes here: changing decisions changes seeded
replay. New games must use the current policy; migration and compatibility
checks belong at the record boundary.
