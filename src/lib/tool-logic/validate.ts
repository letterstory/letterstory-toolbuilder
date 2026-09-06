import { parse, type Program } from "acorn";

const DISALLOWED_IMPORTS = new Set<string>();
const NETWORK_GLOBALS = new Set(["fetch", "XMLHttpRequest", "WebSocket"]);

export interface ToolLogicStaticValidationResult {
	ok: boolean;
	errors: string[];
}

function walk(node: unknown, visit: (node: Record<string, unknown>) => void): void {
	if (!node || typeof node !== "object") return;
	if (!("type" in node) || typeof (node as { type?: unknown }).type !== "string") return;
	const typedNode = node as Record<string, unknown>;
	visit(typedNode);
	for (const value of Object.values(typedNode)) {
		if (Array.isArray(value)) {
			for (const item of value) walk(item, visit);
			continue;
		}
		walk(value, visit);
	}
}

function memberExpressionPath(node: Record<string, unknown>): string | null {
	if (node.type !== "MemberExpression") return null;
	const objectNode = node.object as Record<string, unknown> | undefined;
	const propertyNode = node.property as Record<string, unknown> | undefined;
	const objectName = objectNode?.type === "Identifier" ? String(objectNode.name) : null;
	const propertyName =
		propertyNode?.type === "Identifier"
			? String(propertyNode.name)
			: propertyNode?.type === "Literal"
				? String(propertyNode.value)
				: null;
	if (!objectName || !propertyName) return null;
	return `${objectName}.${propertyName}`;
}

function isIdentifierNamed(node: unknown, name: string): boolean {
	return Boolean(node && typeof node === "object" && (node as { type?: string }).type === "Identifier" && (node as { name?: string }).name === name);
}

function callTargetName(node: unknown): string | null {
	if (!node || typeof node !== "object") return null;
	const typed = node as Record<string, unknown>;
	if (typed.type === "Identifier") return String(typed.name);
	if (typed.type === "MemberExpression") {
		const property = typed.property as Record<string, unknown> | undefined;
		if (property?.type === "Identifier") return String(property.name);
	}
	return null;
}

export function validateGeneratedHandlerSource(source: string): ToolLogicStaticValidationResult {
	let ast: Program;
	try {
		ast = parse(source, { ecmaVersion: "latest", sourceType: "script" }) as Program;
	} catch (error) {
		return {
			ok: false,
			errors: [
				`Generated handler is not valid JavaScript: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}

	const errors = new Set<string>();
	walk(ast as unknown as Record<string, unknown>, (node) => {
		if (node.type === "ImportDeclaration") {
			const sourceValue = String((node.source as { value?: unknown } | undefined)?.value ?? "");
			if (!DISALLOWED_IMPORTS.has(sourceValue)) {
				errors.add(`Imports are not allowed in generated handlers (${sourceValue}).`);
			}
		}

		if (node.type === "ImportExpression") {
			errors.add("Dynamic import() is not allowed in generated handlers.");
		}

		if (node.type === "CallExpression") {
			const callee = node.callee;
			if (isIdentifierNamed(callee, "eval")) {
				errors.add("eval() is not allowed in generated handlers.");
			}
			if (isIdentifierNamed(callee, "require")) {
				const firstArgument = (node.arguments as unknown[] | undefined)?.[0] as
					| { type?: string; value?: unknown }
					| undefined;
				const specifier = firstArgument?.type === "Literal" ? String(firstArgument.value) : null;
				if (!specifier || !DISALLOWED_IMPORTS.has(specifier)) {
					errors.add(
						`require() is not allowed in generated handlers${specifier ? ` (${specifier})` : ""}.`
					);
				}
			}
			const targetName = callTargetName(callee);
			if (targetName && NETWORK_GLOBALS.has(targetName)) {
				errors.add(`Network primitive ${targetName} is not allowed in generated handlers.`);
			}
		}

		if (node.type === "NewExpression") {
			const targetName = callTargetName(node.callee);
			if (targetName === "Function") {
				errors.add("Function constructor usage is not allowed in generated handlers.");
			}
			if (targetName && NETWORK_GLOBALS.has(targetName)) {
				errors.add(`Network primitive ${targetName} is not allowed in generated handlers.`);
			}
		}

		if (node.type === "Identifier") {
			const identifierName = String(node.name);
			if (identifierName === "fetch") {
				errors.add("Network primitive fetch is not allowed in generated handlers.");
			}
		}

		if (node.type === "MemberExpression") {
			const path = memberExpressionPath(node);
			if (path === "process.env") {
				errors.add("process.env access is not allowed in generated handlers.");
			}
			if (path === "process.exit") {
				errors.add("process.exit is not allowed in generated handlers.");
			}
			const objectName = (node.object as { type?: string; name?: string } | undefined)?.name;
			const propertyName = (node.property as { type?: string; name?: string } | undefined)?.name;
			if (
				(objectName === "globalThis" || objectName === "window" || objectName === "self") &&
				propertyName &&
				NETWORK_GLOBALS.has(propertyName)
			) {
				errors.add(`Network primitive ${propertyName} is not allowed in generated handlers.`);
			}
		}
	});

	return { ok: errors.size === 0, errors: [...errors] };
}
