import subprocess
import json

raw = subprocess.check_output(['docker', 'exec', '-t', 'formbricks-postgres', 'psql', '-U', 'postgres', '-d', 'formbricks_ai_lab_staging', '-A', '-t', '-c', "SELECT blocks FROM \"Survey\" WHERE id='cms7i03kc000201pluwi68q1d'"])
data = json.loads(raw.decode('utf-8').strip())
print("Element type of first element in first block:")
print(data[0]['elements'][0]['type'])
