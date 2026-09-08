# Milestone 1 direct MySQL datasource UI

The dashboard flow covers direct MySQL only: test a candidate, save it after backend verification, list safe metadata, re-test saved connections, enable or disable, and delete.

Focused automated checks cover the direct test request and its organization header, the form's required-field validation, and the rendered connection workflow.

Manual acceptance:

1. Start the API and web app with an existing workspace selected.
2. Open **Data Sources**, enter direct MySQL host, port, database, username, and password, then choose **Test connection**.
3. Save a successful connection and confirm the saved row shows no password.
4. Re-test it, disable and enable it, then delete it.

For a MySQL server on the local machine, set `ALLOW_LOCAL_DATASOURCES=true` only in a development environment; the default SSRF protections reject local and private addresses.
