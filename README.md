# Signal Walk

[Open Signal Walk](https://coolcode.ca/signalwalk/) to compare two walks from Android Network Survey at the same physical checkpoints. Select files from your own device. All parsing, drawing and export run in your browser. Closing the tab clears the session.

<!-- coolcode:guide -->
Select each walk’s LTE, NR and phone-state CSVs together, then enter the elapsed time for the same landmark in both recordings. The report uses relative times and numeric checkpoint labels so locations and identifiers stay out of the export.
<!-- /coolcode:guide -->

## Record and compare

Enable cellular and phone-state CSV logging in Android Network Survey. Record each walk separately and note the elapsed seconds at places you want to compare. Find the files under `Download/NetworkSurveyData/csv`. Choose that walk's `craxiom-lte`, `craxiom-nr` and `craxiom-phonestate` files together, including rotated parts. The importer reads column names so the files may be renamed. A recording can contain just one supported record type. Reselecting files replaces the whole walk and clears its alignments.

Start times and original timestamps help locate the landmarks. Add a named checkpoint with one time per walk and select it to place both events at zero on the shared elapsed-time scale. Repeat for other landmarks. The plot shows individual serving-cell LTE RSRP and NR SS-RSRP observations. The table includes neighbours, unknown roles, secondary serving legs, CSI-RSRP, raw timestamp strings and recorded phone-state changes. Time offsets use millisecond resolution. An absent point leaves a gap. The checkpoint summary picks the nearest relevant observation within 15 seconds per stream without filling the interval.

Identities are compared within a technology, SIM slot and serving role. A change flag indicates that two successive reported identities differ. Unknown identities break the comparison. Measurements with an unknown serving role remain in the table.

Phone-state CSVs contain an array of registration-information objects. Some include domain, access technology, roaming or rejection details and omit the registration state itself. The tool shows recognizable fields and marks an absent state as unreported. A SIM marked READY or a weak signal alone does not establish whether the phone registered successfully.

## Privacy and formats

The JSON report exports relative offsets, known role, power, a change flag and recognized phone-state fields. It excludes network and cell identifiers, coordinates, SIM slot, device and mission identifiers, original timestamps, filenames and user-entered checkpoint text. Recorded times and radio observations may still be distinctive. The application keeps logs in memory. CoolCode counts page opens by tool ID. The count excludes recordings, cell observations and checkpoint names.

The current import headers follow the [official CSV manual](https://networksurvey.app/manual/data-logging/csv/) and the [Android phone-state logger](https://github.com/christianrowlands/android-network-survey/blob/develop/networksurvey/src/main/java/com/craxiom/networksurvey/logging/PhoneStateCsvLogger.java). Format review dates are recorded in `web/data/formats.json`. The app processes user-selected recordings on demand.

## Development

Run `node --test tests/*.test.mjs`, `python -m unittest discover -s tests` and `python scripts/build.py`. Serve `dist/` with a local HTTP server. GitHub Actions exercises project-subpath imports and exports in Chromium before deploying. Test inputs are schema fixtures and are never presented as field recordings.
