import { NextResponse } from "next/server";
import { deleteGeneratedToolSurface, getGeneratedToolSurface } from "@/lib/surfaces/tools";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
	const response = await getGeneratedToolSurface({ id }, { request });
	return NextResponse.json(response.body, { status: response.statusCode });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
	const response = await deleteGeneratedToolSurface({ id });
	return NextResponse.json(response.body, { status: response.statusCode });
}
