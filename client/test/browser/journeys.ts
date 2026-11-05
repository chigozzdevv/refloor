type Locator = {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  selectOption(value: string): Promise<unknown>;
  isVisible(): Promise<boolean>;
  waitFor(options: { state: 'visible' | 'hidden'; timeoutMs?: number }): Promise<void>;
};
type Chooser = { setFiles(paths: string[]): Promise<void> };
type Download = { path(): Promise<string | null> };
export type JourneyTab = {
  reload(): Promise<void>;
  playwright: {
    locator(selector: string): Locator;
    getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator;
    getByText(text: string, options?: { exact?: boolean }): Locator;
    waitForEvent(event: 'filechooser'): Promise<Chooser>;
    waitForEvent(event: 'download'): Promise<Download>;
    domSnapshot(): Promise<string>;
  };
};

async function wait(tab: JourneyTab, locator: Locator, state: 'visible' | 'hidden') {
  let failure: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await locator.waitFor({ state, timeoutMs: 3000 });
      return;
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(
    `Browser journey did not reach ${state}: ${String(failure)}\n${await tab.playwright.domSnapshot()}`,
  );
}
export async function openHouse(tab: JourneyTab) {
  await tab.playwright.getByRole('button', { name: 'House controls', exact: true }).click();
}
export async function startHouse(tab: JourneyTab) {
  await tab.playwright
    .getByRole('button', { name: 'Choose a starting house', exact: true })
    .click();
  await tab.playwright.getByRole('button', { name: /The Garden House/ }).click();
  // The introduction advances itself; its temporary buttons may disappear between reads.
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'House controls', exact: true }),
    'visible',
  );
}
export async function importHouse(tab: JourneyTab, path: string) {
  await openHouse(tab);
  await tab.playwright.getByRole('button', { name: 'Homes', exact: true }).click();
  await tab.playwright.getByText('Files & recovery', { exact: true }).click();
  const pending = tab.playwright.waitForEvent('filechooser');
  await tab.playwright.getByRole('button', { name: 'Import house', exact: true }).click();
  await (await pending).setFiles([path]);
  await wait(tab, tab.playwright.locator('.homes-menu'), 'hidden');
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'Open door using handle', exact: true }),
    'visible',
  );
  const close = tab.playwright.getByRole('button', { name: 'Close house controls', exact: true });
  if (await close.isVisible()) await close.click();
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'Open door using handle', exact: true }),
    'visible',
  );
  await tab.playwright.getByRole('button', { name: 'Open door using handle', exact: true }).click();
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'Drag to move in any direction', exact: true }),
    'visible',
  );
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'Stop moving', exact: true }),
    'hidden',
  );
  await wait(
    tab,
    tab.playwright.getByRole('navigation', { name: 'Room navigation', exact: true }),
    'visible',
  );
}
export async function visitRoom(tab: JourneyTab, floor: string, room: string) {
  await tab.playwright.getByRole('button', { name: 'Expand house map', exact: true }).click();
  await tab.playwright.getByRole('tab', { name: floor, exact: true }).click();
  const current = tab.playwright.getByRole('button', {
    name: `Go to ${room}, current room`,
    exact: true,
  });
  if (await current.isVisible()) {
    await tab.playwright.getByRole('button', { name: 'Close map', exact: true }).click();
  } else {
    await tab.playwright.getByRole('button', { name: `Go to ${room}`, exact: true }).click();
    await wait(tab, current, 'visible');
    await wait(
      tab,
      tab.playwright.getByRole('button', { name: 'Stop moving', exact: true }),
      'hidden',
    );
  }
  await wait(
    tab,
    tab.playwright.getByRole('navigation', { name: 'Room navigation', exact: true }),
    'visible',
  );
  const snapshot = await tab.playwright.domSnapshot();
  if (/Could not|cannot reach|blocked|could not/i.test(snapshot)) throw new Error(snapshot);
  if (!snapshot.includes('Room navigation'))
    throw new Error(`No next navigation action after arriving in ${room}\n${snapshot}`);
  return `${floor}: ${room}`;
}
export async function editRefrigerator(tab: JourneyTab, roomId: string) {
  await openHouse(tab);
  await tab.playwright.getByRole('button', { name: 'Furniture', exact: true }).click();
  await tab.playwright
    .getByRole('combobox', { name: 'Choose room', exact: true })
    .selectOption(roomId);
  await tab.playwright.getByRole('button', { name: /^Stainless refrigerator/ }).click();
  const input = tab.playwright.getByRole('textbox', {
    name: 'Message Stainless refrigerator',
    exact: true,
  });
  for (const [command, reply] of [
    ['Open the refrigerator doors', 'Opened Stainless refrigerator.'],
    ['Close the refrigerator doors', 'Closed Stainless refrigerator.'],
  ]) {
    await input.fill(command!);
    await tab.playwright.getByRole('button', { name: 'Send request', exact: true }).click();
    await wait(tab, tab.playwright.getByText(reply!, { exact: true }), 'visible');
  }
  await tab.playwright.getByRole('button', { name: 'Close chat', exact: true }).click();
}
export async function undoRedo(tab: JourneyTab, direction: 'Undo' | 'Redo') {
  await openHouse(tab);
  await tab.playwright.getByRole('button', { name: 'Edit history', exact: true }).click();
  await tab.playwright.getByRole('button', { name: direction, exact: true }).click();
  await tab.playwright.getByRole('button', { name: 'Close history', exact: true }).click();
}
export async function descend(tab: JourneyTab) {
  await tab.playwright.getByRole('button', { name: 'Go downstairs', exact: true }).click();
  await wait(
    tab,
    tab.playwright.getByRole('img', { name: 'Ground floor plan', exact: true }),
    'visible',
  );
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'Stop moving', exact: true }),
    'hidden',
  );
  await wait(
    tab,
    tab.playwright.getByRole('navigation', { name: 'Room navigation', exact: true }),
    'visible',
  );
}
export async function leaveHouse(tab: JourneyTab) {
  const entrance = tab.playwright.getByRole('button', { name: 'Walk to entrance', exact: true });
  if (await entrance.isVisible()) {
    await entrance.click();
    await wait(
      tab,
      tab.playwright.getByRole('button', { name: 'Stop moving', exact: true }),
      'hidden',
    );
  }
  const handle = tab.playwright.getByRole('button', {
    name: /^(Open door using handle|Enter through door handle)$/,
  });
  await wait(tab, handle, 'visible');
  await handle.click();
  await wait(
    tab,
    tab.playwright.getByRole('button', { name: 'Stop moving', exact: true }),
    'hidden',
  );
  if (await tab.playwright.locator('.map-current').isVisible())
    throw new Error('The entrance trip did not leave the interior');
}
export async function exportHouse(tab: JourneyTab) {
  await openHouse(tab);
  await tab.playwright.getByRole('button', { name: 'Homes', exact: true }).click();
  await tab.playwright.getByText('Files & recovery', { exact: true }).click();
  const pending = tab.playwright.waitForEvent('download');
  await tab.playwright.getByRole('button', { name: 'Export house', exact: true }).click();
  const path = await (await pending).path();
  await tab.playwright.getByRole('button', { name: 'Close homes', exact: true }).click();
  if (!path) throw new Error('The browser did not export the house');
  return path;
}

type Fixture = {
  floors: {
    name: string;
    rooms: { id: string; name: string; kind: string; uses?: string[] | undefined }[];
  }[];
};
export async function runHouseJourney(
  tab: JourneyTab,
  path: string,
  house: Fixture,
  report: (step: string) => void,
  afterEdits?: () => Promise<void>,
) {
  await importHouse(tab, path);
  report('Imported and entered the house through its real door');
  for (const floor of house.floors)
    for (const room of floor.rooms) report(await visitRoom(tab, floor.name, room.name));
  if (house.floors.length > 1) {
    await descend(tab);
    report('Returned downstairs through the staircase');
  }
  const kitchenFloor = house.floors.find((floor) =>
      floor.rooms.some((room) => room.kind === 'kitchen' || room.uses?.includes('kitchen')),
    ),
    kitchen = kitchenFloor?.rooms.find(
      (room) => room.kind === 'kitchen' || room.uses?.includes('kitchen'),
    );
  if (kitchen && kitchenFloor) {
    await visitRoom(tab, kitchenFloor.name, kitchen.name);
    await editRefrigerator(tab, kitchen.id);
    report('Opened and closed the refrigerator through chat');
    await afterEdits?.();
  }
  const ground = house.floors[0]!,
    entrance =
      ground.rooms.find((room) => room.kind === 'corridor') ??
      ground.rooms.find((room) => room.kind === 'living')!;
  await visitRoom(tab, ground.name, entrance.name);
  await leaveHouse(tab);
  report('Returned outside through the entrance');
}
