import { z } from 'zod';
import { Executor, transact } from './pg';
import { getPokeBackend } from './poke';
import {
  createList,
  createTodo,
  createShare,
  deleteList,
  deleteTodo,
  deleteShare,
  putClient,
  putClientGroup,
  updateTodo,
  Affected,
  getClientGroup,
  getClient,
} from './data';
import { createGhIssue, updateGhIssue, deleteGhIssue } from './services/github-sync/gh-issues'; // Import ghIssues service
import type { ReadonlyJSONValue } from 'replicache';
import { listSchema, shareSchema, todoSchema } from './entities';

const mutationSchema = z.object({
  id: z.number(),
  clientID: z.string(),
  name: z.string(),
  args: z.any(),
});

type Mutation = z.infer<typeof mutationSchema>;

const pushRequestSchema = z.object({
  clientGroupID: z.string(),
  mutations: z.array(mutationSchema),
});

export async function push(userID: string, requestBody: ReadonlyJSONValue) {
  console.log('Processing push', JSON.stringify(requestBody, null, ''));

  const push = pushRequestSchema.parse(requestBody);

  const t0 = Date.now();

  const allAffected = {
    listIDs: new Set<string>(),
    userIDs: new Set<string>(),
  };

  for (const mutation of push.mutations) {
    try {
      const affected = await processMutation(
        userID,
        push.clientGroupID,
        mutation,
        false,
      );
      for (const listID of affected.listIDs) {
        allAffected.listIDs.add(listID);
      }
      for (const userID of affected.userIDs) {
        allAffected.userIDs.add(userID);
      }
    } catch (e) {
      await processMutation(userID, push.clientGroupID, mutation, true);
    }
  }

  const pokeBackend = getPokeBackend();
  for (const listID of allAffected.listIDs) {
    pokeBackend.poke(`list/${listID}`);
  }
  for (const userID of allAffected.userIDs) {
    pokeBackend.poke(`user/${userID}`);
  }

  console.log('Processed all mutations in', Date.now() - t0);
}

// Implements the push algorithm from
// https://doc.replicache.dev/strategies/row-version#push
async function processMutation(
  userID: string,
  clientGroupID: string,
  mutation: Mutation,
  // 1: `let errorMode = false`. In JS, we implement this step naturally
  // as a param. In case of failure, caller will call us again with `true`.
  errorMode: boolean,
): Promise<Affected> {
  // 2: beginTransaction
  return await transact(async executor => {
    let affected: Affected = { listIDs: [], userIDs: [] };

    console.log(
      'Processing mutation',
      errorMode ? 'errorMode' : '',
      JSON.stringify(mutation, null, ''),
    );

    // 3: `getClientGroup(body.clientGroupID)`
    // 4: Verify requesting user owns cg (in function)
    const clientGroup = await getClientGroup(executor, clientGroupID, userID);
    // 5: `getClient(mutation.clientID)`
    // 6: Verify requesting client group owns requested client
    const baseClient = await getClient(
      executor,
      mutation.clientID,
      clientGroupID,
    );

    // 7: init nextMutationID
    const nextMutationID = baseClient.lastMutationID + 1;

    // 8: rollback and skip if already processed.
    if (mutation.id < nextMutationID) {
      console.log(
        `Mutation ${mutation.id} has already been processed - skipping`,
      );
      return affected;
    }

    // 9: Rollback and error if from future.
    if (mutation.id > nextMutationID) {
      throw new Error(`Mutation ${mutation.id} is from the future - aborting`);
    }

    const t1 = Date.now();

    if (!errorMode) {
      try {
        // 10(i): Run business logic
        // 10(i)(a): xmin column is automatically updated by Postgres for any
        //   affected rows.
        affected = await mutate(executor, userID, mutation);
      } catch (e) {
        // 10(ii)(a-c): log error, abort, and retry
        console.error(
          `Error executing mutation: ${JSON.stringify(mutation)}: ${e}`,
        );
        throw e;
      }
    }

    // 11-12: put client and client group
    const nextClient = {
      id: mutation.clientID,
      clientGroupID,
      lastMutationID: nextMutationID,
    };

    await Promise.all([
      putClientGroup(executor, clientGroup),
      putClient(executor, nextClient),
    ]);

    console.log('Processed mutation in', Date.now() - t1);
    return affected;
  });
}

async function mutate(
  executor: Executor,
  userID: string,
  mutation: Mutation,
): Promise<Affected> {
  switch (mutation.name) {
    case 'createList':
      return await createList(
        executor,
        userID,
        listSchema.parse(mutation.args),
      );
    case 'deleteList':
      return await deleteList(
        executor,
        userID,
        z.string().parse(mutation.args),
      );
    case 'createTodo':
      const todo = todoSchema.omit({ sort: true }).parse(mutation.args);
      console.log('Called to create todo', todo)
      const createResult = await createTodo(
        executor,
        userID,
        todo,
      );

      try {
        // Not awaiting this promise as I want the user to see the todos in action.
        // If I await this promise, it would end up blocking the creation of the todo
        // till the creation of the issue.
        createGhIssue(executor, todo, userID);
      } catch (err) {
        console.log('Error in creating GH Issue', err)
      }

      return createResult;
    case 'createShare':
      return await createShare(
        executor,
        userID,
        shareSchema.parse(mutation.args),
      );
    case 'deleteShare':
      return await deleteShare(
        executor,
        userID,
        z.string().parse(mutation.args),
      );
    case 'updateTodo':
      const updatedTodo = todoSchema
        .partial()
        .merge(todoSchema.pick({ id: true }))
        .parse(mutation.args);
      const updateResult = await updateTodo(
        executor,
        userID,
        updatedTodo,
      );
      try {
        // Not awaiting this promise as I want the user to see the todos in action.
        // If I await this promise, it would end up blocking the update of the todo
        // till the update of the issue.
        updateGhIssue(executor, updatedTodo, userID);
      } catch (err) {
        console.log('Error in updating GH Issue', err)
      }
      return updateResult;
    case 'deleteTodo':
      const todoId = z.string().parse(mutation.args);
      const deleteResult = await deleteTodo(
        executor,
        userID,
        todoId,
      );
      try {
        // Not awaiting this promise as I want the user to see the todos in action.
        // If I await this promise, it would end up blocking the deletion of the todo
        // till the deletion of the issue.
        deleteGhIssue(executor, todoId, userID);
      } catch (err) {
        console.log('Error in deleting GH Issue', err)
      }
      return deleteResult;
    default:
      return {
        listIDs: [],
        userIDs: [],
      };
  }
}