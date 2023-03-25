// @ts-ignore
import { Function } from "./Interpreter/Primitives/Function";
// @ts-ignore
import { Field } from "./Interpreter/Primitives/Struct";

type LexerToken = { type: string; value: string; start: number; end: number; };

export type Program = { entryPoint: FunctionDefStatement, functions: FunctionDefStatement[] } & StatementCommon

/* Parser return types */
export type StatementCommon = { type: string, start: number, end: number };
export type BlockStatement = { body: StatementCommon[] } & StatementCommon;
export type LoopStatement = { body: StatementCommon } & StatementCommon;
export type IfStatement = { test: StatementCommon, consequent: BlockStatement, elseConsequent: BlockStatement | null } & StatementCommon;
export type WhileStatement = { test: StatementCommon, consequent: BlockStatement } & StatementCommon;
export type FunctionDefStatement = { id: string, parameters: FunctionParameter[], body: BlockStatement } & StatementCommon;
export type FunctionParameter = { id: string, paramType: string } & StatementCommon;
export type CallExpression = { callee: StatementCommon, arguments: StatementCommon[] } & StatementCommon;
export type Argument = {} & StatementCommon;
export type StructDefStatement = { id: string, fields: Field[] } & StatementCommon;
export type StructImplStatement = { structId: string, functions: FunctionDefStatement[] } & StatementCommon;
export type VariableDeclaration = { id: string, init: StatementCommon } & StatementCommon;
export type ReturnStatement = { value: StatementCommon | null } & StatementCommon;
export type BreakStatement = { value: StatementCommon | null } & StatementCommon;
export type LogicalExpression = { left: StatementCommon, operator: LexerToken, right: StatementCommon } & StatementCommon;
export type BinaryExpression = { left: StatementCommon, operator: LexerToken, right: StatementCommon } & StatementCommon;
export type UnaryExpression = { argument: UnaryExpression, operator: string } & StatementCommon;
export type Atom<T> = { value: T } & StatementCommon
export type MemberExpression = { object: StatementCommon, property: LexerToken } & StatementCommon
export type StructMethodAccessor = { struct: StatementCommon, method: Identifier } & StatementCommon
export type Identifier = { value: string } & StatementCommon
export type MemberAssign = { object: StatementCommon, value: LexerToken } & StatementCommon
export type Assign = { left: Identifier, value: LexerToken } & StatementCommon

export class Parser {
    tokens: LexerToken[];
    code: string;
    errStart: number;
    errEnd: number;
    errMessage: string;
    isVscode: boolean;

    constructor(tokens: LexerToken[], code: string, isVscode: boolean = false) {
        this.tokens = tokens;
        this.code = code;
        this.errStart = 0;
        this.errEnd = 0;
        this.errMessage = "";
        this.isVscode = isVscode
    }

    /** 
     * Checks if a token is a specific symbol
     * @throws
     */
    private expectSymbol = (_token: LexerToken | null, symbol: string): LexerToken => {
        const token = _token ?? this.tokens.shift()!;
        if (token.value != symbol)
            throw this.parseError(`Expected symbol '${symbol}' instead got '${token.value}`, token.start, token.end)

        return token;
    }

    /**
     * Creates a formatted error and logs it to node
     */
    private parseError = (message: string, startIdx: number, endIdx: number): Error => {
        const lineStart = this.code.lastIndexOf("\n", startIdx) + 1;
        const line = this.code.substring(lineStart, endIdx);
        const lineNum = this.code.substring(0, startIdx).split("\n").length;
        const colNum = startIdx - lineStart + 1;

        const err = new Error(`${message}, at line ${lineNum}, column ${colNum}'`)
        err.stack = ""
        err.name = "Parser"

        this.errStart = startIdx;
        this.errEnd = endIdx;
        this.errMessage = message;
        return err;
    }

    /**
     * Parses this.tokens into expressions to be used for the interpreter
     */
    public parse = () => {
        try {
            return [this.Program(null), null]
        }
        catch (e) {
            return [null, e]
        }
    }

    private Program = (_token: LexerToken | null): Program => {
        var start: number = this.tokens[0].start;
        var entryPoint: FunctionDefStatement | null = null;
        var functions: FunctionDefStatement[] = [];
        var structs: StructDefStatement[] = []
        var end: number = 0;

        while (this.tokens[0].value !== "endOfFile") {
            const token = _token ?? this.tokens.shift()!;
            end = token.end;

            if (token.value === "fn") {
                if (this.tokens[0].value === "Main") {
                    entryPoint = this.FunctionDefStatement(token);
                    end = entryPoint.end;
                }
                else {
                    const fn = this.FunctionDefStatement(token);
                    end = fn.end;
                    functions.push(fn);
                }
            }
            else if (token.value === "struct") {
                const struct = this.StructDefStatement(token);
                structs.push(struct);
            }
            else {
                throw this.parseError(`(${token.type}: ${token.value}) is not supported at the top level`, token.start, token.end)
            }
        }

        if (entryPoint === null) throw this.parseError(`Program has no entry point. Expected function with identifier 'Main'`, end, end)

        return {
            type: "Program",
            entryPoint,
            functions,
            start,
            end,
        }
    }

    private BlockStatement = (topLevelFlag: boolean = false): BlockStatement => {
        var statements: StatementCommon[] = []
        var start: number = 0;
        var end: number = 0;

        if (this.tokens[0].value === "{" || topLevelFlag) {
            if (!topLevelFlag) start = this.expectSymbol(null, "{").start
            start = this.tokens[0]!.start;

            while (!["}", "endOfFile"].includes(this.tokens[0].value)) {
                var token = this.tokens.shift()!;
                end = token.end
                const statement = this.Statement(token);
                statements.push(statement)

                if (statement.type.startsWith("Incomplete")) break;
            }

            if (!topLevelFlag) end = this.expectSymbol(null, "}").end;
        }
        else {
            var token = this.tokens.shift()!;
            start = token.start
            end = token.end
            statements.push(this.Statement(token))
        }

        return {
            type: "BlockStatement",
            body: statements,
            start,
            end
        }
    }

    private Statement = (_token: LexerToken | null): StatementCommon => {
        const token = _token ?? this.tokens.shift()!;

        if (["if", "fn", "struct", "impl", "while", "loop"].includes(token.value)) return this.CompoundStatement(token);

        if (["let", "return", "break"].includes(token.value)) {
            let stmt = this.SimpleStatement(token)
            if (stmt.type.startsWith("Incomplete")) return stmt;
            this.expectSymbol(null, ";")
            return stmt
        }

        const expr = this.Expression(token)
        if (expr.type.startsWith("Incomplete")) return expr;
        this.expectSymbol(null, ";")
        return expr
    }

    /* Compound Statements */
    private CompoundStatement = (_token: LexerToken | null): StatementCommon => {
        const token = _token ?? this.tokens.shift()!;

        if (token.value == "if") return this.IfStatement(token)
        else if (token.value == "fn") return this.FunctionDefStatement(token)
        else if (token.value == "while") return this.WhileStatement(token)
        else if (token.value == "struct") return this.StructDefStatement(token)
        else if (token.value == "impl") return this.StructImplStatement(token)
        else if (token.value == "loop") return this.LoopStatement(token);

        throw this.parseError(`Unexpected Token ${token.value}`, token.start, token.end);
    }

    private IfStatement = (_token: LexerToken | null): IfStatement => {
        const ifKeyword = _token ?? this.tokens.shift()!;
        this.expectSymbol(null, "(")
        const test = this.Expression(null)
        if (test.type.startsWith("Incomplete")) return test;
        this.expectSymbol(null, ")")

        const consequent = this.BlockStatement()
        var elseConsequent: BlockStatement | null = null;

        if (this.tokens[0].value == "else") {
            this.tokens.shift();
            elseConsequent = this.BlockStatement()
        }

        return {
            type: "IfStatement",
            test,
            consequent: consequent,
            elseConsequent: elseConsequent,
            start: ifKeyword.start,
            end: elseConsequent?.end ?? consequent.end
        }
    }

    private LoopStatement = (_token: LexerToken | null): LoopStatement => {
        const loopKeyword = _token ?? this.tokens.shift()!;
        const body = this.BlockStatement();

        return {
            type: "LoopStatement",
            body,
            start: loopKeyword.start,
            end: body.end
        };
    }

    private WhileStatement = (_token: LexerToken | null): LoopStatement => {
        const whileKeyword = _token ?? this.tokens.shift()!;

        this.expectSymbol(null, "(")
        const test = this.Expression(null)
        if (test.type.startsWith("Incomplete")) return test;
        this.expectSymbol(null, ")")

        const body = this.BlockStatement()

        const breakIfTestNotMetStatement = {
            type: "IfStatement",
            test: {
                start: test.start,
                end: test.end,
                type: "UnaryExpression",
                argument: test,
                operator: "!"
            },
            consequent: {
                start: test.start,
                end: test.end,
                type: "BlockStatement",
                body: [{
                    type: "BreakExpression",
                    start: test.start,
                    end: test.end,
                    value: null
                }]
            },
            start: test.start,
            end: test.end,
            elseConsequent: null
        }
        
        body.body.unshift(breakIfTestNotMetStatement)

        return {
            type: "LoopStatement",
            body,
            start: whileKeyword.start,
            end: body.end
        }
    }

    private FunctionDefStatement = (_token: LexerToken | null): FunctionDefStatement => {
        const fnKeyword = _token ?? this.tokens.shift()!;
        const identifier = this.tokens.shift()!;
        this.expectSymbol(null, "(")
        const parameters = this.FunctionParameters();
        this.expectSymbol(null, ")")
        const block = this.BlockStatement()

        return {
            type: "FunctionDeclaration",
            id: identifier.value,
            parameters,
            body: block,
            start: fnKeyword.start,
            end: block.end
        }
    }

    private FunctionParameters = (): FunctionParameter[] => {
        var parameters: FunctionParameter[] = [];
        if (this.tokens[0].value == ")") return []

        var id = this.tokens.shift()!;
        this.expectSymbol(null, ":")
        var type = this.tokens.shift()!;

        parameters.push(
            { id: id.value, paramType: type.value, start: id.start, end: type.end, type: "FunctionParameter" }
        )

        while (this.tokens[0].value == ",") {
            this.tokens.shift();

            var id = this.tokens.shift()!;
            this.expectSymbol(null, ":")
            var type = this.tokens.shift()!;
            parameters.push(
                { id: id.value, paramType: type.value, start: id.start, end: type.end, type: "FunctionParameter" }
            )
        }

        return parameters;
    }

    private Arguments = (closingValue = ")"): any[] => {
        var parameters: any[] = []

        // No params passed
        if (this.tokens[0].value == closingValue) return []
        const expr = this.Expression(null)
        if (expr.type.startsWith("Incomplete")) return expr;
        parameters.push(expr)

        while (this.tokens[0].value == ",") {
            this.tokens.shift()
            const expr = this.Expression(null)
            if (expr.type.startsWith("Incomplete")) return expr;
            parameters.push(expr)
        }

        return parameters
    }

    private StructDefStatement = (_token: LexerToken | null): StructDefStatement => {
        const structKeyword = _token ?? this.tokens.shift()!;
        const start = structKeyword.start;
        const identifier = this.tokens.shift()!.value;

        this.expectSymbol(null, "{")
        const fields: Field[] = []

        while (this.tokens[0].value != "}") {
            const name = this.tokens.shift()!
            this.expectSymbol(null, ":")
            const type = this.tokens.shift()!
            fields.push({ name: name.value, type: type.value })

            if (this.tokens[0].value == "}") break;
            // Optional comma at last field
            if (this.tokens[1].value == "}") {
                this.expectSymbol(null, ",")
            }
            else this.expectSymbol(null, ",")
        }

        var closing = this.tokens.shift()!;
        this.expectSymbol(closing, "}")

        return {
            type: "StructDeclaration",
            id: identifier,
            fields,
            start,
            end: closing.end
        }
    }

    private StructImplStatement = (_token: LexerToken | null): StructImplStatement => {
        const implKeyword = _token ?? this.tokens.shift()!;
        const start = implKeyword.start;
        const structId = this.tokens.shift()!.value;

        this.expectSymbol(null, "{")

        var functions: FunctionDefStatement[] = []

        while (this.tokens[0].value != "}") {
            functions.push(this.FunctionDefStatement(null))
        }

        const closing = this.tokens.shift()!;
        this.expectSymbol(closing, "}")

        return {
            type: "StructImpl",
            structId,
            start,
            functions,
            end: closing.end
        }
    }

    /* Simple Statements */
    private SimpleStatement = (_token: LexerToken | null): StatementCommon => {
        const token = _token ?? this.tokens.shift()!;
        if (token.value == "let") return this.VariableDeclaration(token)
        else if (token.value == "return") return this.ReturnStatement(token);
        else if (token.value == "break") return this.BreakStatement(token);

        throw this.parseError(`Unexpected Token ${token.value}`, token.start, token.end);
    }

    private VariableDeclaration = (_token: LexerToken | null): VariableDeclaration => {
        const letToken = _token ?? this.tokens.shift()!;
        const identifier = this.tokens.shift()!.value;
        this.expectSymbol(null, "=")
        const init = this.Expression(null)
        if (init.type.startsWith("Incomplete")) return init;

        return {
            type: "VariableDeclaration",
            id: identifier,
            init,
            start: letToken.start,
            end: init.end
        }
    }

    private ReturnStatement = (_token: LexerToken | null): ReturnStatement => {
        const returnKeyword = _token ?? this.tokens.shift()!;
        if (this.tokens[0].value == ";") {
            return {
                type: "ReturnExpression",
                value: null,
                start: returnKeyword.start,
                end: returnKeyword.end
            }
        }

        else {
            const value = this.Expression(null);
            if (value.type.startsWith("Incomplete")) return value;

            return {
                type: "ReturnExpression",
                value: value,
                start: returnKeyword.start,
                end: value.end
            }
        }
    }

    private BreakStatement = (_token: LexerToken | null): BreakStatement => {
        const returnKeyword = _token ?? this.tokens.shift()!;

        return {
            type: "BreakExpression",
            value: null,
            start: returnKeyword.start,
            end: returnKeyword.end
        }
    }

    /* Expressions */
    private Expression = (_token: LexerToken | null): any => {
        var left = this.Comparison(_token ?? this.tokens.shift()!)
        if (left.type.startsWith("Incomplete")) return left;

        while (["&&", "||"].includes(this.tokens[0]?.value)) {
            let operator = this.tokens.shift()!
            let right = this.Comparison(this.tokens.shift()!)
            if (right.type.startsWith("Incomplete")) return left;

            left = {
                type: "LogicalExpression",
                left,
                operator,
                right,
                start: left.start,
                end: right.end
            }
        }

        return left
    }

    private Comparison = (_token: LexerToken | null): any => {
        var left = this.Sum(_token ?? this.tokens.shift()!)
        if (left.type.startsWith("Incomplete")) return left;

        while (["!=", "==", ">", ">=", "<", "<="].includes(this.tokens[0]?.value)) {
            let operator = this.tokens.shift()!
            let right = this.Sum(this.tokens.shift()!)
            if (right.type.startsWith("Incomplete")) return left;

            left = {
                type: "BinaryExpression",
                left,
                operator,
                right,
                start: left.start,
                end: right.end
            }
        }

        return left;
    }

    private Sum = (_token: LexerToken | null): any => {
        let left = this.Term(_token ?? this.tokens.shift()!);
        if (left.type.startsWith("Incomplete")) return left;

        while (["+", "-"].includes(this.tokens[0]?.value)) {
            let operator = this.tokens.shift()
            let right = this.Term(this.tokens.shift()!)
            if (right.type.startsWith("Incomplete")) return left;

            left = {
                type: "BinaryExpression",
                left,
                operator,
                right,
                start: left.start,
                end: right.end
            }
        }

        return left;
    }

    private Term = (_token: LexerToken | null): any => {
        let left: any = this.Factor(_token ?? this.tokens.shift()!);
        if (left.type.startsWith("Incomplete")) return left;

        while (["*", "/", "%"].includes(this.tokens[0]?.value)) {
            let operator = this.tokens.shift()
            let right = this.Term(this.tokens.shift()!)
            if (right.type.startsWith("Incomplete")) return right;

            left = {
                type: "BinaryExpression",
                left,
                operator,
                right,
                start: left.start
            }
        }

        return this.Factor(left);
    }

    private Factor = (_token: LexerToken | null): any => {
        let token = _token ?? this.tokens.shift()!;

        if (["-", "!"].includes(token.value)) {
            let factor = this.Factor(null);
            if (factor.type.startsWith("Incomplete")) return factor;

            return {
                type: "UnaryExpression",
                argument: factor,
                operator: token.value,
                start: token.start,
                end: factor.end
            }
        }

        return this.Power(token)
    }

    private Power = (_token: LexerToken | null): any => {
        let left = this.Primary(_token ?? this.tokens.shift()!);
        if (left.type.startsWith("Incomplete")) return left;

        if (this.tokens[0].value == "**") {
            let operator = this.tokens.shift()
            let right = this.Factor(null)

            return {
                type: "BinaryExpression",
                left,
                operator,
                right,
                start: left.start,
                end: right.end
            }
        }

        return left
    }

    private Primary = (_token: LexerToken | null): any => {
        let left = this.Atom(_token ?? this.tokens.shift()!);
        if (left.type.startsWith("Incomplete")) return left;

        if (["="].includes(this.tokens[0]?.value)) {
            let op = this.tokens.shift()!;

            if (op.value == "=") {
                var right = this.Expression(null);
                if (right.type.startsWith("Incomplete")) return right;

                left = {
                    type: "Assign",
                    left: left,
                    value: right,
                    start: left.start,
                    end: right.end
                }
                return left;
            }
        }

        while ([".", "(", "{", "::", "["].includes(this.tokens[0]?.value)) {
            let op = this.tokens.shift()!;

            if (op.value == ".") {
                try {
                    let right = this.Atom(null)
                    left = {
                        type: "MemberExpression",
                        object: left,
                        property: right,
                        start: left.start,
                        end: right.end
                    }
                } catch (e) {
                    if (!this.isVscode) throw e;
                    return {
                        type: "IncompleteMemberExpression",
                        object: left,
                        start: left.start,
                        end: op.end
                    }
                }
            }

            else if (op.value == "[") {
                let index = this.Expression(null)
                if (index.type.startsWith("Incomplete")) return index;

                let end = this.expectSymbol(null, "]")
                left = {
                    type: "IndexExpression",
                    object: left,
                    index,
                    start: left.start,
                    end: end.end
                }
            }

            else if (op.value == "(") {
                var args = this.Arguments();
                var closing = this.tokens.shift()!;
                if (closing.value != ")") throw new Error("Expected ')'")

                left = {
                    type: "CallExpression",
                    callee: left,
                    arguments: args,
                    start: left.start,
                    end: closing.end
                }

            }

            else if (op.value == "{") {
                const fields: any[] = []

                while (this.tokens[0].value != "}") {
                    const name = this.tokens.shift()!;
                    this.expectSymbol(null, ":")
                    const value = this.Expression(null)!;
                    if (value.type.startsWith("Incomplete")) return value;
                    fields.push([name, value])

                    if (this.tokens[0].value == "}") break;
                    // Optional comma at last field
                    if (this.tokens[1].value == "}") {
                        this.expectSymbol(null, ",")
                    }
                    else this.expectSymbol(null, ",")
                }

                const closing = this.expectSymbol(null, "}")

                left = {
                    type: "StructExpression",
                    id: left,
                    fields,
                    start: left.start,
                    end: closing.end
                }
            }

            else if (op.value == "::") {
                try {
                    let right = this.Atom(null)
                    left = {
                        type: "StructMethodAccessor",
                        struct: left,
                        method: right,
                        start: left.start,
                        end: right.end
                    }
                } catch (e) {
                    if (!this.isVscode) throw e;
                    return {
                        type: "IncompleteStructMethodAccessor",
                        object: left,
                        start: left.start,
                        end: op.end
                    }
                }
            }
        }

        if (["="].includes(this.tokens[0]?.value)) {
            let op = this.tokens.shift()!;

            if (op.value == "=") {
                var right = this.Expression(null);
                if (right.type.startsWith("Incomplete")) return right;

                left = {
                    type: "MemberAssign",
                    object: left,
                    value: right,
                    start: left.start,
                    end: right.end
                }
            }
        }

        return left
    }

    private Atom = (_token: LexerToken | null): any => {
        let token = _token ?? this.tokens.shift()!;

        // Literally just ignore
        if (["Number", "Identifier", "String", "Boolean", "BinaryExpression", "UnaryExpression", "MemberExpression", "CallExpression",
            "StructExpression", "StructMethodAccessor", "Array", "IndexExpression", "MemberAssign", "Assign"
        ].includes(token.type)) return token;

        if (token.type == "numberLiteral")
            return { type: "Number", value: parseFloat(token.value), start: token.start, end: token.end }

        else if (token.type == "stringLiteral")
            return { type: "String", value: token.value.substring(1, token.value.length - 1), start: token.start, end: token.end }

        else if (token.type == "BooleanLiteral")
            return { type: "Boolean", value: token.value.toLowerCase() == "true", start: token.start, end: token.end }

        else if (token.type == "identifier")
            return { type: "Identifier", value: token.value, start: token.start, end: token.end }

        // Group
        else if (token.value == "(") {
            let expr = this.Expression(null);
            if (expr.type.startsWith("Incomplete")) return expr;

            let next = this.tokens.shift()!;
            if (next.value != ")") throw new Error(`Expected ')' instead got ${next.type}`)
            return expr
        }
        else if (token.value == "[") {
            let args = this.Arguments("]");
            let end = this.expectSymbol(null, "]")
            return { type: "Array", value: args, start: token.start, end: end.end }
        }

        throw this.parseError(`Expected type of [numberLiteral, stringLiteral, BooleanLiteral, identifier, array] instead got (type: '${token.type}', value: '${token.value}')`, token.start, token.end)
    }
}