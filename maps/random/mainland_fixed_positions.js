Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmbiome");

function playerPlacementCircleMt(radius, startingAngle = undefined, center = undefined)
{
	const startAngle = startingAngle !== undefined ? startingAngle : randomAngle();
	let [playerPositions, playerAngles] =
		distributePointsOnCircle(getNumPlayers(), startAngle, radius, center || g_Map.getCenter());

	let playerIDs = getPlayerIDs();
	const grouped = groupPlayersByArea(playerIDs, playerPositions);
	if (Array.isArray(grouped))
		[playerIDs, playerPositions] = grouped;

	return [playerIDs, playerPositions.map(p => p.round()), playerAngles, startAngle];
}

export function* generateMap(mapSettings)
{
	const heightLand = 3;

	// ✅ R28 biome init order (matches your working map)
	const biome = mapSettings?.Biome || currentBiome();
	setBiome(biome);

	// ✅ Now terrains exist
	if (!g_Terrains || !g_Terrains.mainTerrain)
	{
		warn("Biome failed, falling back to temperate biome");
		setBiome("generic/temperate");
	}

	// ✅ Create map AFTER biome
	globalThis.g_Map = new RandomMap(heightLand, g_Terrains.mainTerrain);

	const tMainTerrain = g_Terrains.mainTerrain;
	if (!tMainTerrain)
		throw new Error("Biome failed to initialize mainTerrain");

	const tForestFloor1 = g_Terrains.forestFloor1 || tMainTerrain;
	const tForestFloor2 = g_Terrains.forestFloor2 || tMainTerrain;
	const tRoad = g_Terrains.road || tMainTerrain;
	const tRoadWild = g_Terrains.roadWild || tMainTerrain;

	// Gaia
	const oTree1 = g_Gaia.tree1;
	const oTree2 = g_Gaia.tree2;
	const oTree3 = g_Gaia.tree3;
	const oTree4 = g_Gaia.tree4;
	const oFruitBush = g_Gaia.fruitBush;
	const oMainHuntableAnimal = g_Gaia.mainHuntableAnimal;
	const oSecondaryHuntableAnimal = g_Gaia.secondaryHuntableAnimal;
	const oStoneLarge = g_Gaia.stoneLarge;
	const oMetalLarge = g_Gaia.metalLarge;
	const aGrassShort = g_Decoratives.grassShort;

	const numPlayers = getNumPlayers();

	// Tile classes
	const clPlayer = g_Map.createTileClass();
	const clForest = g_Map.createTileClass();
	const clFood = g_Map.createTileClass();
	const clRock = g_Map.createTileClass();
	const clMetal = g_Map.createTileClass();
	const clBaseResource = g_Map.createTileClass();

	// Player placement
	const playerPlacements = playerPlacementCircleMt(fractionToTiles(0.28 + numPlayers * 0.007));

	placePlayerBases({
		"PlayerPlacement": playerPlacements,
		"PlayerTileClass": clPlayer,
		"BaseResourceClass": clBaseResource,
		"CityPatch": { "outerTerrain": tRoadWild, "innerTerrain": tRoad },
		"Berries": { "template": oFruitBush },
		"Mines": { "types": [{ "template": oMetalLarge }, { "template": oStoneLarge }] },
		"Trees": { "template": oTree1, "count": 5 },
		"Decoratives": { "template": aGrassShort }
	});

	// Hills / bluffs
	createBumps(avoidClasses(clPlayer, 20));

	// Forests
	const forestTerrains = [tMainTerrain, tForestFloor1, tForestFloor2].filter(Boolean);
	const [forestTrees, stragglerTrees] = getTreeCounts(...rBiomeTreeCount(1));

	createDefaultForests(
		forestTerrains,
		avoidClasses(clPlayer, 20, clForest, 18),
		clForest,
		forestTrees
	);

	// Food (stock rmgen has no placePlayerFoodBalanced — mirror vanilla mainland.js)
	if (!isNomad()) {
		createFood(
			[
				[new SimpleObject(oMainHuntableAnimal, 5, 7, 0, 4)],
				[new SimpleObject(oSecondaryHuntableAnimal, 2, 3, 0, 2)]
			],
			[3 * numPlayers, 3 * numPlayers],
			avoidClasses(clForest, 0, clPlayer, 45, clHill, 1, clMetal, 4, clRock, 4, clFood, 20),
			clFood
		);
		createFood(
			[[new SimpleObject(oFruitBush, 5, 7, 0, 4)]],
			[3 * numPlayers],
			avoidClasses(clForest, 0, clPlayer, 40, clHill, 1, clMetal, 4, clRock, 4, clFood, 10),
			clFood
		);
	}

	// Straggler trees
	createStragglerTrees(
		[oTree1, oTree2, oTree3, oTree4],
		avoidClasses(clForest, 8, clPlayer, 12, clMetal, 6, clRock, 6, clFood, 1),
		clForest,
		stragglerTrees
	);

	placePlayersNomad(clPlayer, avoidClasses(clForest, 1, clMetal, 4, clRock, 4, clFood, 2));

	return g_Map;
}