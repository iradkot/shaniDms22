# Keep meal facts separate from Loop reports

ShaniDms stores Meal Carbohydrates and Reported Carbohydrates as parallel facts rather than treating either as the authoritative replacement for the other. Food and similar-meal analysis use the local Meal Entry, while Loop-context analysis uses the inspectable total and individual timing of linked External Carb Records; a missing value remains unknown instead of being copied silently. This costs some UI complexity but preserves the difference between what was eaten and what the external system was told.
