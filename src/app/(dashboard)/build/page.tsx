import { ToolBuilderWorkspace } from "@/components/tools/tool-builder-workspace";
import { PageHeader } from "@/components/ui/page-header";

export default function BuildPage() {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Build a tool"
				description="Describe a branded micro-tool in plain language and generate a real, working, iframe-embeddable version of it."
			/>
			<ToolBuilderWorkspace />
		</div>
	);
}
