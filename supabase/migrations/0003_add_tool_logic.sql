alter table generated_tools
	add column if not exists logic jsonb;
