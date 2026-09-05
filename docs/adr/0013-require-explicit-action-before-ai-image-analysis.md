# Require explicit action before AI image analysis

Capturing, storing, or synchronising a Meal Image never sends it to an LLM. Image analysis starts only from an explicit Product User action and travels through the normal ShaniDms LLM proxy, preserving a clear privacy boundary even though automatic analysis would make capture faster.
