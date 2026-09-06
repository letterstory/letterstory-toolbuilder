import { BrandWorkspace } from "@/components/brand/brand-workspace";
import { PageHeader } from "@/components/ui/page-header";

export default function BrandPage() {
	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
			<PageHeader
				title="Brand ingestion"
				description="Pull a real site into Toolbuilder and inspect the extracted palette, typography, imagery, and brand signals before generation."
			/>
			<BrandWorkspace />
		</div>
	);
}
