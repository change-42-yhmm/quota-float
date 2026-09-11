# 0.2.10 supporter prompt

The supporter window now opens on the first two full application launches of each version, for both supporters and non-supporters. The third and subsequent launches do not open it automatically. Updating versions resets the two-launch allowance. Reinstalling the same version with retained user preferences does not reset the count.

Older global prompt revision records no longer suppress prompts for new versions. Saving preferences through the renderer preserves the native prompt version and launch count. Existing licenses are retained.

Validation: 27 Rust tests passed (one unrelated native visual API smoke test ignored). Regression tests cover two-launch limits, version changes, legacy records, serialization and renderer preference preservation.

The native desktop material and workbench CSS parameters are unchanged from 0.2.9. The user reported that 0.2.9 renders successfully on Windows, with stronger blur than desired. Host Backdrop has no exposed blur-radius setting in the current implementation; changing visual opacity would blend the material with the clear desktop rather than change the system blur radius.
