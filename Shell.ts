import { Tokenize } from "./src/Lexer"
import { Parser, StatementCommon } from "./src/Parser"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { Interpreter } from "./src/Interpreter";
import { Context } from "./src/Context";
import { StructType } from "./src/Struct/StructType";
import { NativeFunction } from "./src/Struct/NativeFunction";
import { StructInstance } from "./src/Struct/StructInstance";
import { NativeEnum } from "./src/Struct/NativeEnum";
// import { Interpreter } from "./src/Interpreter/Interpreter";
// import { Context } from "./src/Interpreter/Context";
// import { NumberStruct } from "./src/Interpreter/Structs/NumberStruct";
// import { BooleanStruct } from "./src/Interpreter/Structs/BooleanStruct";
// import { StringStruct } from "./src/Interpreter/Structs/StringStruct";
// import { NativeFunction } from "./src/Interpreter/Primitives/NativeFunction";
// import { StructRuntime } from "./src/Interpreter/Primitives/StructRuntime";
// import { Struct } from "./src/Interpreter/Primitives/Struct";
// import { ArrayStruct } from "./src/Interpreter/Structs/ArrayStruct";

if (!existsSync("./err")) mkdirSync("./err");
const input = readFileSync("./input.cos", { encoding: 'utf-8' });

/* Lexing */
const tokens = Tokenize(input);
writeFileSync('./err/tokens.json', JSON.stringify(tokens, null, 2), { flag: "w" });

// /* AST Parsing */
const [ast, parseError]: any = new Parser(tokens, input).parse();
if (parseError) {
    console.error(parseError);
    process.exit(1);
}
writeFileSync('./err/ast.json', JSON.stringify(ast, null, 2), { flag: "w" });

const Vec3 = new StructType("Vec3", [
    new NativeFunction("From", async (interpreter, context, start, end, args): Promise<[any, Context]> => {
        const instance = new StructInstance(Vec3);
        instance.selfCtx.setSymbol("x", args[0]);
        instance.selfCtx.setSymbol("y", args[1]);
        instance.selfCtx.setSymbol("z", args[2]);
        return [instance, context];
    }),

    new NativeFunction("Modify", async (interpreter, context, start, end, args): Promise<[any, Context]> => {
        var selfRef = context.stack.pop() as StructInstance;
        if (!(selfRef instanceof StructInstance)) throw Interpreter.internalError("Modify can only be ran on an instance of a Vec3")

        var [val, context] = await interpreter.number({value: 3}, context);

        selfRef.selfCtx.setSymbol("x", val);
        selfRef.selfCtx.setSymbol("y", val);
        selfRef.selfCtx.setSymbol("z", val);

        return [null, context];
    })
]);

const Status = new NativeEnum("Status", ["Ok", "Err"])

/* Interpreting */
const globals = new Context()
globals.setSymbol("Vec3", Vec3)
globals.setSymbol("Status", Status)

globals.setSymbol("log", new NativeFunction("log", async (interpreter, ctx, start, end, args) => {
    var args = args.map((arg: any) => {
        if (arg instanceof StructInstance) {
            return arg.selfCtx.getProtected("value")
        } else throw new Error("Cannot log")
    })
    console.warn(">", ...args)

    return [null, ctx];
}))


new Interpreter(input).findTraverseFunc(ast, globals)