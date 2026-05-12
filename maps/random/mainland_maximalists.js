
Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmbiome");
/**
 * Determine player starting positions on a circular pattern.
 */
function playerPlacementCircleMt(radius, startingAngle = undefined, center) {
	const startAngle = startingAngle !== undefined ? startingAngle : randomAngle();
	let [playerPositions, playerAngles] = distributePointsOnCircle(getNumPlayers(), startAngle, radius, center);
	// Get player IDs
	let playerIDs = getPlayerIDs();

	// Group players by area (teams stay together)
	const grouped = groupPlayersByArea(playerIDs, playerPositions);

	// Handle both old and new API shapes
	if (Array.isArray(grouped)) {
		// Old rmgen: [playerIDs, playerPositions]
		[playerIDs, playerPositions] = grouped;
	} else if (grouped && grouped.playerPositions && grouped.playerIDs) {
		// New rmgen (Release 28)
		playerIDs = grouped.playerIDs;
		playerPositions = grouped.playerPositions;
	} else {
		// Fallback: grouping didn't change anything
		g_Map.log("groupPlayersByArea returned unexpected value, using original positions");
	}

	return [playerIDs, playerPositions.map(p => p.round()), playerAngles, startAngle];
}


function getSurroundingAreasMt(positions, radius = 35) {
	return positions.map(pos => createArea(new DiskPlacer(radius, pos), null, null));
}


/**
 * Hills are elevated, planar, impassable terrain areas.
 */
function createPassableHillsMt(terrainset, constraints, tileClass, count, minSize, maxSize, spread, failFraction = 0.8, elevation = 50, elevationSmoothing = 20) {
	g_Map.log("Creating hills");
	createAreas(
		new ChainPlacer(
			minSize || 1,
			maxSize || Math.floor(scaleByMapSize(4, 6)),
			spread || Math.floor(scaleByMapSize(16, 60)),
			failFraction),
		[
			new LayeredPainter(terrainset, [1, elevationSmoothing]),
			new SmoothElevationPainter(ELEVATION_SET, elevation, elevationSmoothing),
			new TileClassPainter(tileClass)
		],
		constraints,
		count || scaleByMapSize(1, 4) * getNumPlayers());
}

/**
 * Places player additionnal food around his base in a balanced way
 * such that every player will have approximately the same quantity of food.
 * The total quantity of food, and the distribution between hunt and berries
 * can also be defined in the argument.
 
 * @param areas - The surrounding area of each player, where resources will be placed.
 * @param oBerryMain - The template of the berry resource.
 * @param oBerryStraggler - The template of the berry straggler tree, if null it won't be placed.
 * @param oMainHuntable - The template of the main huntable animal.
 * @param oSecondaryHuntable - The template of the secondary huntable animal.
 * @param clFood - The 'food' class to paint.
 * @param constraints - Custom constraints.
 * @param foodAvailability - A relative number describing how abundant food should be.
 * @param huntBerryRatio - A relative number defining which resource is most likely to be picked.
 */
function placePlayerFoodBalancedMt(areas, oBerryMain, oBerryStraggler, oMainHuntable, oSecondaryHuntable, clFood, constraints, foodAvailability = 1, huntBerryRatio = 1) {
	const foodPath = "ResourceSupply/Max";
	let mainBerryFood = GetBaseTemplateDataValue(Engine.GetTemplate(oBerryMain), foodPath);
	let mainHuntableFood = GetBaseTemplateDataValue(Engine.GetTemplate(oMainHuntable), foodPath);
	let secondaryHuntableFood = GetBaseTemplateDataValue(Engine.GetTemplate(oSecondaryHuntable), foodPath);
	let constraint = new AndConstraint(constraints);
	let place = function (type, amount, area) {
		let group = new SimpleGroup(
			[new SimpleObject(type, amount, amount, 0, 4)],
			true, clFood
		);
		createObjectGroupsByAreas(group, 0, constraints, 1, 300, [area]);
	};

	let totalFood = randIntInclusive(0, 20) * 100 * foodAvailability;
	totalFood += Math.max(mainHuntableFood, secondaryHuntableFood) * 5;
	if (randBool(0.2))
		totalFood = 0;

	for (let area of areas) {
		let remainingFood = totalFood;
		while (remainingFood > 0) {
			if (remainingFood <= 700) {
				// We want to get as close to 0 as possible to end food placement.
				// In low quantities of food, berries are less useful, so we generate hunt everytime.
				let smallestAnimal, smallestAnimalFood;
				if (mainHuntableFood < secondaryHuntableFood) {
					smallestAnimal = oMainHuntable;
					smallestAnimalFood = mainHuntableFood;
				} else {
					smallestAnimal = oSecondaryHuntable;
					smallestAnimalFood = secondaryHuntableFood;
				}
				let amount = remainingFood / smallestAnimalFood;
				place(smallestAnimal, amount, area);
				remainingFood = 0;
			} else {
				if (randBool(0.5 * huntBerryRatio)) {
					let currentAnimal, currentAnimalFood;
					if (randBool(0.5)) {
						currentAnimal = oMainHuntable;
						currentAnimalFood = mainHuntableFood;
					} else {
						currentAnimal = oSecondaryHuntable;
						currentAnimalFood = secondaryHuntableFood;
					}
					let maxAmount = remainingFood / currentAnimalFood;
					let desiredAmount = randIntInclusive(5, 7);
					desiredAmount = Math.max(desiredAmount, desiredAmount * 100 / currentAnimalFood);
					let amount = Math.min(maxAmount, desiredAmount);
					remainingFood -= amount * currentAnimalFood;
					place(currentAnimal, amount, area);
				} else {
					let amount = Math.min(remainingFood, 1200) / mainBerryFood;
					remainingFood -= amount * mainBerryFood;
					place(oBerryMain, amount, area);
				}
			}
		}
	}
}


export function* generateMap(mapSettings) {
	const heightLand = 3;
	const biome = mapSettings?.Biome || currentBiome();
	setBiome(biome);
	if (!g_Terrains || !g_Terrains.mainTerrain) {
		warn("Biome failed, falling back to temperate biome");
		setBiome("generic/temperate");
	}
	const tMainTerrain = g_Terrains.mainTerrain;
	if (!tMainTerrain)
		throw new Error("Biome failed to initialize mainTerrain");
	globalThis.g_Map = new RandomMap(heightLand, tMainTerrain);

	const tForestFloor1 = g_Terrains.forestFloor1;
	const tForestFloor2 = g_Terrains.forestFloor2;
	const tCliff = g_Terrains.cliff;
	const tTier1Terrain = g_Terrains.tier1Terrain;
	const tTier2Terrain = g_Terrains.tier2Terrain;
	const tTier3Terrain = g_Terrains.tier3Terrain;
	const tHill = g_Terrains.hill;
	const tRoad = g_Terrains.road;
	const tRoadWild = g_Terrains.roadWild;
	const tTier4Terrain = g_Terrains.tier4Terrain;

	const oTree1 = g_Gaia.tree1;
	const oTree2 = g_Gaia.tree2;
	const oTree3 = g_Gaia.tree3;
	const oTree4 = g_Gaia.tree4;
	const oTree5 = g_Gaia.tree5;
	const sTree1 = g_Gaia.tree6 || null;
	const sTree2 = g_Gaia.tree7 || null;
	const sTree3 = g_Gaia.tree8 || null;
	const sTree4 = g_Gaia.tree9 || null;
	const sTree5 = g_Gaia.tree10 || null;
	const oFruitBush = g_Gaia.fruitBush;
	const oMainHuntableAnimal = g_Gaia.mainHuntableAnimal;
	const oSecondaryHuntableAnimal = g_Gaia.secondaryHuntableAnimal;
	const oStoneLarge = g_Gaia.stoneLarge;
	const oStoneSmall = g_Gaia.stoneSmall;
	const oMetalLarge = g_Gaia.metalLarge;
	const oMetalSmall = g_Gaia.metalSmall;

	const aGrass = g_Decoratives.grass;
	const aGrassShort = g_Decoratives.grassShort;
	const aRockLarge = g_Decoratives.rockLarge;
	const aRockMedium = g_Decoratives.rockMedium;
	const aBushMedium = g_Decoratives.bushMedium;
	const aBushSmall = g_Decoratives.bushSmall;

	const pForest1 = [tForestFloor2 + TERRAIN_SEPARATOR + oTree1, tForestFloor2 + TERRAIN_SEPARATOR + oTree2, tForestFloor2];
	const pForest2 = [tForestFloor1 + TERRAIN_SEPARATOR + oTree4, tForestFloor1 + TERRAIN_SEPARATOR + oTree5, tForestFloor1];

	const numPlayers = getNumPlayers();

	var clPlayer = g_Map.createTileClass();
	var clHill = g_Map.createTileClass();
	var clForest = g_Map.createTileClass();
	var clDirt = g_Map.createTileClass();
	var clRock = g_Map.createTileClass();
	var clMetal = g_Map.createTileClass();
	var clFood = g_Map.createTileClass();
	var clBaseResource = g_Map.createTileClass();

	const playerPlacements = playerPlacementCircleMt(fractionToTiles(0.35), undefined, g_Map.getCenter());
	placePlayerBases({
		"PlayerPlacement": playerPlacements,
		"PlayerTileClass": clPlayer,
		"BaseResourceClass": clBaseResource,
		"CityPatch": {
			"outerTerrain": tRoadWild,
			"innerTerrain": tRoad
		},
		"StartingAnimal": {},
		"Berries": { "template": oFruitBush },
		"Mines": { "types": [{ "template": oMetalLarge }, { "template": oStoneLarge }] },
		"Trees": { "template": oTree1, "count": 5 },
		"Decoratives": { "template": aGrassShort }
	});


	createBumps(avoidClasses(clPlayer, 20));
	createPassableHillsMt([tCliff, tCliff, tHill], avoidClasses(clPlayer, 20, clHill, 15), clHill, scaleByMapSize(3, 30));

	var [forestTrees, stragglerTrees] = getTreeCounts(...rBiomeTreeCount(1));
	createDefaultForests(
		[tMainTerrain, tForestFloor1, tForestFloor2, pForest1, pForest2],
		avoidClasses(clPlayer, 20, clForest, 18, clHill, 0),
		clForest,
		forestTrees
	);


	g_Map.log("Creating dirt patches");
	createLayeredPatches(
		[scaleByMapSize(3, 6), scaleByMapSize(5, 10), scaleByMapSize(8, 21)],
		[[tMainTerrain, tTier1Terrain], [tTier1Terrain, tTier2Terrain], [tTier2Terrain, tTier3Terrain]],
		[1, 1],
		avoidClasses(clForest, 0, clHill, 0, clDirt, 5, clPlayer, 12),
		scaleByMapSize(15, 45),
		clDirt
	);

	g_Map.log("Creating grass patches");
	createPatches(
		[scaleByMapSize(2, 4), scaleByMapSize(3, 7), scaleByMapSize(5, 15)],
		tTier4Terrain,
		avoidClasses(clForest, 0, clHill, 0, clDirt, 5, clPlayer, 12),
		scaleByMapSize(15, 45),
		clDirt
	);


	g_Map.log("Creating metal mines");
	createBalancedMetalMines(
		oMetalSmall,
		oMetalLarge,
		clMetal,
		avoidClasses(clForest, 1, clPlayer, scaleByMapSize(20, 35), clHill, 1)
	);

	g_Map.log("Creating stone mines");
	createBalancedStoneMines(
		oStoneSmall,
		oStoneLarge,
		clRock,
		avoidClasses(clForest, 1, clPlayer, scaleByMapSize(20, 35), clHill, 1, clMetal, 10)
	);


	var planetm = 1;
	if (currentBiome() == "generic/india")
		planetm = 8;

	createDecoration(
		[
			[new SimpleObject(aRockMedium, 1, 3, 0, 1)],
			[new SimpleObject(aRockLarge, 1, 2, 0, 1), new SimpleObject(aRockMedium, 1, 3, 0, 2)],
			[new SimpleObject(aGrassShort, 1, 2, 0, 1)],
			[new SimpleObject(aGrass, 2, 4, 0, 1.8), new SimpleObject(aGrassShort, 3, 6, 1.2, 2.5)],
			[new SimpleObject(aBushMedium, 1, 2, 0, 2), new SimpleObject(aBushSmall, 2, 4, 0, 2)]
		],
		[
			scaleByMapSize(16, 262),
			scaleByMapSize(8, 131),
			planetm * scaleByMapSize(13, 200),
			planetm * scaleByMapSize(13, 200),
			planetm * scaleByMapSize(13, 200)
		],
		avoidClasses(clForest, 0, clPlayer, 0, clHill, 0)
	);


	createFood(
		[
			[new SimpleObject(oMainHuntableAnimal, 5, 7, 0, 4)],
			[new SimpleObject(oSecondaryHuntableAnimal, 2, 3, 0, 2)]
		],
		[
			3 * numPlayers,
			3 * numPlayers
		],
		avoidClasses(clForest, 0, clPlayer, 45, clHill, 1, clMetal, 4, clRock, 4, clFood, 20),
		clFood
	);


	createFood(
		[
			[new SimpleObject(oFruitBush, 5, 7, 0, 4)]
		],
		[
			3 * numPlayers
		],
		avoidClasses(clForest, 0, clPlayer, 40, clHill, 1, clMetal, 4, clRock, 4, clFood, 10),
		clFood
	);

	if (false) {
		let playerAreas = getSurroundingAreasMt(playerPlacements[1]);
		placePlayerFoodBalancedMt(
			playerAreas,
			oFruitBush,
			null,
			oMainHuntableAnimal,
			oSecondaryHuntableAnimal,
			clFood,
			avoidClasses(clForest, 0, clPlayer, 25, clHill, 1, clMetal, 4, clRock, 4, clFood, 15)
		);
	}


	if (sTree1 && sTree2 && sTree3 && sTree4 && sTree5) {
		createStragglerTrees(
			[sTree1, sTree2, sTree3, sTree4, sTree5],
			avoidClasses(clForest, 8, clHill, 1, clPlayer, 12, clMetal, 6, clRock, 6, clFood, 1),
			clForest,
			stragglerTrees
		);
	} else {
		createStragglerTrees(
			[oTree1, oTree2, oTree4, oTree3],
			avoidClasses(clForest, 8, clHill, 1, clPlayer, 12, clMetal, 6, clRock, 6, clFood, 1),
			clForest,
			stragglerTrees
		);
	}

	placePlayersNomad(clPlayer, avoidClasses(clForest, 1, clMetal, 4, clRock, 4, clHill, 4, clFood, 2));
	g_Map.log("Map object created OK");
	return g_Map;
}



