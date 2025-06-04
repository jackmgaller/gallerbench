import { assertEquals, assert } from "./test_deps.ts";
import { shuffle } from "../utils/shuffle.ts";

Deno.test("shuffle returns same elements", () => {
  const arr = [1, 2, 3, 4, 5];
  const shuffled = shuffle([...arr]);
  assertEquals(shuffled.sort(), arr.sort());
});

Deno.test("shuffle does not always keep order", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shuffled = shuffle([...arr]);
  const again = shuffle([...arr]);
  assert(
    arr.join() !== shuffled.join() || arr.join() !== again.join(),
    "Shuffle did not change order in two attempts",
  );
});
