# Datasource spec chat

1. Save and activate a MySQL datasource, then select **Analyze** from Data Sources.
2. Choose one accessible non-system database and upload a `.md` file no larger than 15 MiB. Verify the analysis becomes `QUEUED` or `PROCESSING` and says it can continue in the background.
3. Reopen the page and confirm the completed compatibility report remains visible. The Markdown itself and follow-up chat context are not retained.
4. Verify the response compares the specification with metadata only; it must not expose credentials or customer rows.

Automated coverage verifies database filtering, selected-database enforcement, encrypted temporary source handling, terminal source clearing, bounded metadata use, the browser file/chat path, and the typed API requests.
