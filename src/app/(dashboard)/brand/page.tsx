import { BrandWorkspace } from "@/components/brand/brand-workspace";
import { PageHeader } from "@/components/ui/page-header";

export default function BrandPage() {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Brand ingestion"
				description="Pull a real site into Toolbuilder and inspect the extracted palette, typography, imagery, and brand signals before generation." 
			/>
			<BrandWorkspace />
		</div>
	);
}
