import {EventEmitter} from 'events';
import {buildClientSchema, GraphQLSchema, DocumentNode, parse, Source, concatAST} from 'graphql';
import {readJSON, readFile, writeFile} from 'fs-extra';
import {watch} from 'chokidar';
import * as glob from 'glob';
import {compile, Operation, Fragment, AST} from 'graphql-tool-utilities/ast';

import {printFile} from './print';

export interface Options {
  graphQLFiles: string,
  schemaPath: string,
}

export interface RunOptions {
  watch?: boolean,
}

export interface Build {
  documentPath: string,
  definitionPath: string,
  operations: Operation[],
  fragments: Fragment[],
}

export class Builder extends EventEmitter {
  watching: boolean;
  private globs: string;
  private schemaPath: string;
  private schema: GraphQLSchema;
  private documentCache = new Map<string, DocumentNode>();

  constructor({graphQLFiles, schemaPath}: Options) {
    super();
    this.globs = graphQLFiles;
    this.schemaPath = schemaPath;
  }

  on(event: 'error', handler: (error: Error) => void): this
  on(event: 'build', handler: (built: Build) => void): this
  on(event: 'start', handler: () => void): this
  on(event: 'end', handler: () => void): this
  on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  emit(event: 'error', error: Error): boolean
  emit(event: 'build', built: Build): boolean
  emit(event: 'start'): boolean
  emit(event: 'end'): boolean
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  async run({watch: watchGlobs = false} = {}) {
    const {globs} = this;

    const update = async (file: string) => {
      try {
        await this.updateDocumentForFile(file);
      } catch (error) {
        this.emit('error', error);
        return;
      }

      await this.generate();
    };

    if (watchGlobs) {
      const documentWatcher = watch(globs);
      documentWatcher.on('ready', () => {
        documentWatcher.on('add', update);
        documentWatcher.on('change', update);
        documentWatcher.on('unlink', async (file: string) => {
          this.removeDocumentForFile(file);
          await this.generate();
        });
      });
    }

    try {
      await this.updateSchema();
    } catch (error) {
      this.emit('error', error);
      return;
    }

    try {
      await Promise.all(
        glob
          .sync(globs)
          .map(this.updateDocumentForFile.bind(this))
      );
    } catch (error) {
      this.emit('error', error);
      return;
    }

    await this.generate();
  }

  private async generate() {
    this.emit('start');
    let ast: AST;

    try {
      ast = compile(this.schema, concatAST(Array.from(this.documentCache.values())));
    } catch (error) {
      this.emit(error);
      return;
    }

    const fileMap = groupOperationsAndFragmentsByFile(ast);
    await Promise.all(
      Object
        .keys(fileMap)
        .map(async (key) => {
          const file = fileMap[key];
          const definition = printFile(file, ast);
          const definitionPath = `${file.path}.d.ts`;
          await writeFile(definitionPath, definition);

          const build = {
            documentPath: file.path,
            definitionPath,
            operations: file.operations,
            fragments: file.fragments,
          };

          this.emit('build', build);
        })
    );

    this.emit('end');
  }

  private async updateSchema() {
    try {
      const schemaJSON = await readJSON(this.schemaPath, 'utf8');
      this.schema = buildClientSchema(schemaJSON.data);
    } catch (error) {
      const parseError = new Error(`Error parsing '${this.schemaPath}':\n\n${error.message.replace(/Syntax Error GraphQL \(.*?\) /, '')}`);
      throw parseError;
    }
  }

  private async updateDocumentForFile(file: string) {
    const contents = await readFile(file, 'utf8');
    if (contents.trim().length === 0) { return; }

    const document = parse(new Source(contents, file));
    this.documentCache.set(file, document);
  }

  private removeDocumentForFile(file: string) {
    this.documentCache.delete(file);
  }
}

interface File {
  path: string,
  operations: Operation[],
  fragments: Fragment[],
}

interface FileMap {
  [key: string]: File,
}

function groupOperationsAndFragmentsByFile({operations, fragments}: AST): FileMap {
  const map: FileMap = {};

  Object
    .keys(operations)
    .forEach((name) => {
      const operation = operations[name];
      const file = map[operation.filePath] || {path: operation.filePath, operations: [], fragments: []};
      file.operations.push(operation);
      map[operation.filePath] = file;
    });
  
  Object
    .keys(fragments)
    .forEach((name) => {
      const fragment = fragments[name];
      const file = map[fragment.filePath] || {path: fragment.filePath, operations: [], fragments: []};
      file.fragments.push(fragment);
      map[fragment.filePath] = file;
    });
  
  return map;
}
