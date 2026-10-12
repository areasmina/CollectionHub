# Guillermo's collection-first Commander plan (verbatim, 2026-10-12)

this was the prompt if yu remeber:I think i finally have a plan tell me what you think first of this:
Improve the existing platform into a polished, intelligent, collection-first Commander ecosystem.
The ultimate goal is to help users understand what they can build with the Magic: The Gathering cards they already own, discover viable commanders, generate complete decks, evaluate power levels, analyze existing decks, calculate missing-card costs, and make informed upgrade decisions using transparent and reliable data.
The platform should prioritize collection ownership and practical deck-building decisions rather than simply generating attractive decklists that require purchasing dozens of additional cards.
1. Visual Design, Animation, and Navigation
Make Deck Wizard feel polished, modern, dynamic, responsive, and interactive.
Design requirements

* Preserve the existing visual identity and improve it consistently rather than introducing an unrelated redesign.
* Use smooth animations and transitions for navigation, card displays, filters, collection interactions, loading states, and other relevant elements.
* Add a moving announcement banner at the top of the website for updates, new features, collection insights, and relevant announcements.
* Ensure the announcement banner is responsive, visually integrated, and does not consume excessive vertical space.
* Use subtle hover effects, card transitions, loading skeletons, tooltips, and feedback for user actions.
* Keep layouts space-efficient, with consistent typography, spacing, alignment, and visual hierarchy.
* Avoid excessive decoration, clutter, unnecessary sidebars, oversized headers, and redundant information.
* Ensure the interface works properly on desktop, tablet, and mobile.
* Respect reduced-motion accessibility preferences.
* Maintain appropriate keyboard navigation, contrast, focus indicators, and accessible controls.
* Implement proper loading, error, empty, and unavailable-data states.
* Avoid unnecessary re-rendering and animations that degrade performance.

The interface should feel like a professional MTG platform, not a collection of unrelated feature demonstrations.
Navigation
Review the existing navigation before changing it.
Organize the major features logically, including:

* Commanders.
* Collection.
* Suggested Deck.
* My Decks.
* Deck Simulator.
* Collection Analytics.
* Settings and account management, where supported.

Reuse existing navigation and filtering components whenever practical. Do not create duplicate controls when equivalent functionality already exists elsewhere.
2. Commander Research and External Integrations
Add convenient external-resource link icons beside commanders name / deck
the links to the website of the specific commander card include:
EDHREC
Scryfall
Commander Spellbook
Moxfield and Archidekt
Support importing and exporting decklists where the provider's capabilities and available formats permit it.
Integration requirements

* Use recognizable icons with tooltips and accessible labels.
* Place icons consistently beside commander names when opened and wherever they provide useful context.
* Generate direct links to the appropriate commander, card, deck, combo, or shopping page.
* Validate generated URLs and handle unavailable destinations gracefully.
* Respect provider APIs, rate limits, attribution requirements, and access restrictions.
* Prefer official APIs and documented integration methods.
* Do not scrape restricted sources or claim access to data that is not actually available.
* Do not display an integration as functional when it is merely a placeholder.
* Cache external data sensibly to reduce unnecessary requests.

3. Collection Management
Expand the existing Collection section into a comprehensive collection-management system.
Preserve the existing collection data, import workflows, and card-identification logic.
3.1 Collection organization
Allow users to browse, search, sort, filter, and organize cards by:

* Card name.
* Set and printing.
* Color and color identity.
* Card type and subtype.
* Rarity.
* Mana value.
* Mana cost.
* Market price.
* Total value.
* Quantity owned.
* Foil and other available finishes.
* Language.
* Artist.
* Cards assigned to decks.
* Cards not currently assigned to decks.

Support multiple printings of the same card without accidentally merging different versions, languages, finishes, or other meaningful printing-specific attributes.
Use stable card identifiers and printing identifiers wherever available.
3.2 Advanced search
Implement an advanced search experience inspired by Scryfall.
Support the following filters where the underlying data permits them:
Search

* Card name.
* Set name or set code.
* Language.
* Oracle text.

Legality

* Commander legality.
* Other supported formats.
* Exclusion of cards illegal in the selected format.
* Clear separation between format legality and collection ownership.

Colors

* Color identity.
* Actual card colors.
* Exact color combinations.
* Number of colors.
* Colorless cards.

Card types

* Legendary.
* Creature.
* Angel.
* Artifact.
* Enchantment.
* Instant.
* Sorcery.
* Planeswalker.
* Land.
* Other supported types and subtypes.

Rules text

* Search for phrases such as "Draw a card" or "Flying."
* Support relevant Oracle text queries where feasible.

Mana

* Exact mana costs.
* Mana value ranges.
* Specific mana values.
* Power and toughness ranges where applicable.

Printing and rarity

* Specific expansions.
* Individual printings.
* Common, Uncommon, Rare, Mythic Rare, and other supported rarities.

Price

* Minimum price.
* Maximum price.
* Price provider.
* Printing and finish used for the displayed price.

Additional attributes

* Artist.
* Card layout.
* Reserved List status.
* Foil availability.
* Other supported card characteristics.

Collection-specific filters

* Quantity owned.
* Available unallocated copies.
* Assigned to a deck.
* Not assigned to any deck.
* Present in a custom list.
* Missing from a selected deck.

Allow users to group different printings of the same card when desired.
Do not treat tokens, Un-cards, or other unsupported or illegal cards as ordinary Commander-legal cards. Provide clear filters for relevant card categories, using authoritative card data.
Do not promise full Scryfall query-language compatibility unless it has actually been implemented.
3.3 Quantity management

* Allow users to edit quantities directly from the collection interface.
* Support adding, removing, and editing cards without refreshing the entire application unnecessarily.
* Preserve printing-specific information.
* Avoid duplicate records caused by repeated imports.
* Prevent collection totals from becoming inconsistent when cards are edited, imported, removed, or assigned to decks.
* Confirm destructive actions where appropriate.
* Provide useful validation and error messages.

3.4 Custom collection lists
Allow users to create and manage custom lists, including:

* Trade list.
* Cards to purchase.
* Reserved cards.
* Upgrade candidates.
* Cards to sell.
* Wishlist.
* Custom user-defined categories.

Support adding cards to multiple lists without duplicating their physical collection records.
3.5 Collection counts
Display:

* Total physical cards owned.
* Total unique card identities owned.
* Total distinct printings owned, where supported.
* Number of cards allocated to decks.
* Number of cards remaining unallocated.
* Quantity of each card available for new decks.

Clearly distinguish unique cards from physical copies.
For example, owning three copies of a card means three physical cards but one unique card identity.
3.6 Collection analytics and value
Display:

* Total estimated market value.
* Number of physical cards.
* Number of unique cards.
* Collection value by set.
* Collection value by color.
* Collection value by rarity.
* Collection value by card type.
* Value of cards assigned to decks versus unassigned cards.
* Collection value over time.
* Monetary and percentage changes in value.
* Largest gainers and losers when reliable historical price data is available.

Use actual price snapshots or historical data for changes over time.
Never fabricate historical prices, price movements, gainers, losers, or percentage changes.
If historical data is unavailable, clearly indicate that limitation and begin collecting legitimate snapshots for future comparisons where the architecture supports it.
Use a consistent valuation methodology throughout the application.
4. Collection Matching on Commander Pages
When a user opens a commander, display a dedicated Collection Match section as a view alongside the existing Commander and Average Deck views, rather than inserting it as another oversized section that clutters the page.
Preserve the existing commander-page layout and integrate the new view consistently with its current navigation and visual design.
4.1 Collection Match view
Display:

* Number of recommended cards owned.
* Total number of cards in the reference recommendation list.
* Ownership percentage.
* Cards already owned.
* Cards missing.
* Copies available after accounting for deck allocations.
* Copies already allocated to other decks.
* Estimated cost of missing cards.
* Estimated cost of acquiring additional copies where partial quantities are owned.
* Collection match for different budgets and power brackets when supported.

Example:
Collection Match: 72/99 cards owned (72.7%)
The number above is illustrative only. Calculate the actual result from verified recommendation data and the user's collection.
4.2 Recommendation sources
Use EDHREC data where available.
Distinguish clearly between:

* Popular cards for a commander.
* Cards recommended for a specific archetype.
* Cards included in an average or reference deck.
* Cards selected by the Deck Wizard recommendation engine.
* Cards included in the actual generated deck.

Do not imply that every commander has a universal or definitive top 99.
Display the source, reference-list size, relevant archetype, and data timestamp when available.
4.3 Ownership calculation
Calculate ownership accurately.
A card counts as available only to the extent that physical copies exist and have not been allocated elsewhere.
Account for:

* Multiple copies.
* Different printings.
* Foil and nonfoil finishes.
* Cards allocated to other decks.
* Cards reserved in custom lists, if the user chooses to exclude them.
* Cards that are owned but illegal in the selected format.

Do not treat a card's presence in an imported decklist as proof that the user physically owns it.
Clearly distinguish raw collection ownership from copies available for allocation.
5. Suggested Deck View
Add a new Suggested Deck view to the commander page.
This view should recommend a complete, playable Commander deck using the user's existing collection.
Its primary purpose is to answer:
What is the strongest practical deck I can build with the cards I own, and what upgrades would make the biggest difference?
5.1 Budget and bracket controls
Supports and analyzes Edhrec Commander Brackets 3, 4, and 5, following the current, documented classification system adopted by the application.
Pick the highest percentage of existing dollar-sign budget categories and other working budget controls between the 3 brackets as we only need the one with more percentage collection of those 3 brackets considering the highest collection number in the budget too
Inspect the current implementation before changing available budget tiers.
Optimize recommendations/ suggestions according to:

* Collection match also Commander-specific strategy.
* Estimated missing-card cost.
* Budget constraints.
* Selected power bracket.
* Mana base quality.
* Synergy.
* Deck consistency.
* Ramp and card draw.
* Interaction and protection.
* Win conditions.
* Card availability.

If multiple recommendations are available, explain why was that card selected as an alternate suggestion
5.2 Complete deck requirements
Display:

* Commander or commanders.
* Complete 99-card main deck.
* Estimated total market value.
* Estimated cost of missing cards.
* Collection match percentage.
* Cards already owned.
* Copies available for allocation.
* Additional copies required.
* Mana curve.
* Average mana value.
* Color distribution.
* Mana-source analysis.
* Card-type distribution.
* Ramp.
* Card draw.
* Targeted interaction.
* Board wipes.
* Protection.
* Recursion.
* Tutors.
* Win conditions.
* Primary archetype.
* Secondary synergies.
* Estimated power bracket.
* Confidence level.
* Relevant EDHREC statistics.
* Price sources and timestamps.
* Explanations for important recommendations.

5.3 Deck legality and completeness
Every generated deck must contain exactly 100 cards, including the commander or commanders, unless the selected format explicitly defines a different deck size.
Validate:

* Commander identity.
* Color identity.
* Singleton restrictions.
* Banned cards.
* Commander legality.
* Companion requirements where relevant.
* Special deck-building rules.
* Card quantities.
* Commander and background or partner rules.
* Availability of the required physical copies.

Do not generate an incomplete deck and label it complete.
If a complete list cannot be generated within the user's constraints, explain why and offer the closest valid alternative.
5.4 Recommendation transparency
For every suggested deck, distinguish between:

* A deck built entirely from available collection copies.
* A deck that requires additional purchases.
* A theoretical optimized deck that is not currently buildable.
* A generated deck that still requires user review.

Do not silently assume missing cards are owned.
The primary recommendation should prioritize cards the user can actually allocate from their collection. Present purchase upgrades separately.
6. EDHREC Statistics and Data Transparency
Whenever EDHREC data is used, show the available statistics with accurate labels.
Example:
"Based on 20,174 decks analyzed on EDHREC."
This is an illustrative example, not a fixed value to display.
Requirements:

* Display the source.
* Show the number of decks analyzed when available.
* Show the applicable commander and archetype.
* Show card inclusion percentages when available.
* Display the relevant data timestamp when available.
* Distinguish total commander deck counts from card-specific sample sizes.
* Never confuse deck counts with individual card counts.
* Never invent inclusion percentages, popularity statistics, or sample sizes.
* Do not display unsupported statistics as though they came from EDHREC.
* Use an explicit unavailable-data state when statistics cannot be verified.

If official APIs do not expose the required data, investigate supported alternatives and document their limitations.
Keep EDHREC recommendations separate from Deck Wizard's own collection-based recommendations.
7. My Decks and Deck Analysis
Add or improve a My Decks section supporting imported decks and decks created within Deck Wizard.
7.1 Deck management
Allow users to:

* Import decklists from supported text formats.
* Import decks from Moxfield and Archidekt where technically supported.
* Create decks within Deck Wizard.
* Edit saved decks.
* Duplicate decks.
* Rename decks.
* Delete decks.
* Export decklists in supported formats.
* View the commander and complete decklist.
* View estimated market value.
* View missing cards.
* Analyze the deck's bracket.
* Compare decks against generated alternatives.
* View the collection cards allocated to each deck.

Preserve existing import and export functionality.
7.2 Collection allocation
Maintain a clear distinction between:

* Physical copies owned.
* Copies allocated to decks.
* Copies available for allocation.
* Copies needed to complete a deck.
* Cards listed in a deck that are not owned.

A card appearing in an imported decklist must not automatically become part of the physical collection.
Only update collection ownership when the user explicitly confirms an ownership import or another supported workflow establishes ownership.
Support multiple decks using the same card identity while enforcing actual copy limits where appropriate.
For example, if the user owns one copy of a card, two decks cannot both claim that same physical copy as independently available unless the application clearly treats decklists as virtual alternatives rather than simultaneously assembled decks.
Make the distinction between virtual decklists and physical deck allocation explicit.
7.3 Deck analysis
Analyze:

* Strengths.
* Weaknesses.
* Synergies.
* Consistency.
* Curve.
* Ramp.
* Card draw.
* Interaction.
* Board wipes.
* Protection.
* Recursion.
* Tutors.
* Win conditions.
* Mana-base quality.
* Missing cards.
* Color-identity violations.
* Illegal cards.
* Singleton violations.
* Duplicate cards.
* Relevant combo lines.

Provide useful explanations instead of only numerical ratings.
7.4 Bracket and salt analysis
Estimate the deck's power bracket using the application's documented classification system.
Consider:

* Game Changers and applicable bracket criteria.
* Fast mana.
* Tutors.
* Combo speed and reliability.
* Interaction.
* Protection.
* Recursion.
* Resilience.
* Consistency.
* Win conditions.
* Overall efficiency.

Follow the current official rules and guidance of the chosen classification system where available.
Distinguish verified criteria from heuristic estimates.
Display a confidence level and explain the major factors behind the classification.
Treat salt as a separate measurement from competitive power.
Use a credible source for salt data when available. Otherwise, provide a transparent, documented estimate or state that the value is unavailable.
Do not present subjective classifications as official determinations.
8. Deck Simulator
Add a Deck Simulator that allows users to test their Commander decks and explore their consistency.
8.1 Core functionality
Support:

* Randomized opening hands.
* Mulligan decisions.
* Drawing cards.
* Playing through sample turns.
* Tracking land drops.
* Tracking mana availability.
* Tracking available colored mana.
* Tracking card availability.
* Testing the probability of drawing specific cards.
* Testing the probability of drawing combinations.
* Evaluating ramp availability.
* Evaluating early-game development.
* Saving simulator configurations where supported.

8.2 Statistical simulations
Support repeatable simulations for specified scenarios.
Display:

* Number of trials.
* Observed results.
* Estimated probabilities.
* Relevant assumptions.
* Limitations.
* Reproducibility settings where practical.

Use proper statistical methods for probability calculations.
Clearly distinguish between:

* Exact hypergeometric probabilities for straightforward card-draw questions.
* Monte Carlo simulations.
* Heuristic estimates.
* Manual playtesting.

Do not claim that a draw-and-mana simulator accurately models full multiplayer Commander games.
If the simulator does not model opponents, interaction, political decisions, or complete game-state interactions, explain those limitations.
Preserve legal deck composition and correct card quantities when simulating draws.
9. Account System and Google Sign-In
Evaluate adding Google sign-in alongside any existing authentication method.
First inspect the existing authentication system, session management, database architecture, and deployment environment.
Do not replace a working authentication system without a compelling technical reason.
Where supported, allow users to securely save and synchronize:

* Collections.
* Decklists.
* Custom collection lists.
* Preferred budgets.
* Preferred brackets.
* Collection settings.
* Saved simulator configurations.
* Simulator results.
* Collection price snapshots.
* Other supported preferences.

Requirements:

* Use a reputable authentication provider and supported integration.
* Validate authentication tokens and sessions properly.
* Protect user-owned database records with appropriate access controls.
* Prevent users from reading or modifying other users' collections or decks.
* Handle account linking and duplicate accounts safely.
* Store secrets in environment variables or the appropriate secure configuration.
* Document setup requirements and deployment configuration.
* Do not commit secrets or private credentials.
* Provide meaningful authentication errors and recovery flows.

If external credentials are required, implement the available groundwork and document exactly what remains dependent on configuration.
Do not claim that Google sign-in works until the full flow has been implemented and tested.
10. Pricing and Market Data
Provide transparent pricing information for individual cards, collections, and decklists.
10.1 Price information
Display:

* Price provider.
* Price type.
* Currency.
* Printing.
* Finish.
* Provider's market price or another supported reference price.
* Retrieval timestamp.
* Provider update timestamp, when available.

Example:
Price provider: TCGplayer
Reference price: Market
Currency: CAD
Last retrieved: 12 minutes ago
Provider last updated: Unavailable
The timestamps above are illustrative. Display real values only.
Clearly distinguish when Deck Wizard retrieved a price from when the provider last updated its market data.
10.2 Currency
Use CAD as the default display currency for this application.
If the provider supplies prices in another currency:

* Preserve the original currency and value.
* Convert using a reliable exchange-rate source if conversion is supported.
* Display the conversion methodology and relevant timestamp.
* Avoid presenting converted values as native CAD market prices.

10.3 Price methodology
Use a consistent pricing methodology for:

* Collection valuation.
* Deck valuation.
* Missing-card costs.
* Budget comparisons.
* Purchase recommendations.
* Collection history.
* Price-change calculations.

Compare like with like.
Do not compare prices for different printings, languages, conditions, or finishes as though they represent the same product.
Where a specific printing or finish is unavailable, clearly indicate that the price is an estimate or use an explicitly defined fallback methodology.
10.4 Caching and history
Cache pricing data according to provider limits and sensible refresh intervals.
Avoid unnecessary API requests.
Track legitimate price snapshots if historical valuation is supported.
Never invent price histories or use the current price as a fabricated historical value.
If reliable pricing is unavailable, show an unavailable state rather than an arbitrary number.
11. Mobile Collection Scanning
Investigate a mobile-friendly feature that lets users scan physical cards into their collection using a phone camera.
Treat this as a potentially advanced feature requiring image recognition, card databases, and camera permissions.
Potential functionality

* Scan individual cards.
* Detect likely card names.
* Identify specific printings when possible.
* Display confidence or uncertainty.
* Ask the user to confirm the detected card.
* Select a printing and finish.
* Set the quantity.
* Support batch scanning.
* Detect duplicate scans.
* Avoid accidentally inflating collection quantities.
* Allow manual correction.
* Handle unsupported or unreadable cards gracefully.

Implementation requirements

* Use a supported camera and image-recognition approach.
* Respect browser camera permissions and mobile-device limitations.
* Provide manual search as a fallback.
* Validate detected identities against the application's card database.
* Require confirmation before modifying ownership when recognition is uncertain.
* Handle lighting, rotation, sleeves, foils, and similar recognition challenges as practical.
* Avoid claiming reliable printing identification if the technology only recognizes the card name.

Do not present scanning as implemented until it works reliably on supported devices.
If full scanning requires an external service, document the dependency and cost implications.
12. Collection Presentation Modes
Improve collection browsing with multiple presentation modes.
Support the following where appropriate:

* Standard card grid.
* Compact card grid.
* List view with sortable columns.
* Set-based view.
* Color-based view.
* Price and value view.

Allow users to switch between views without losing:

* Search terms.
* Active filters.
* Sorting preferences.
* Pagination or browsing position where practical.
* Selected collection list.

Display ownership, available quantities, deck allocations, and prices clearly.
Optimize card image loading and rendering for large collections.
Use virtualization or another appropriate performance strategy if the collection is large enough to require it.
Avoid reloading the entire collection unnecessarily when switching views.
13. Implementation Priorities
Implement improvements incrementally, using this order as the default plan.
Adjust the priorities when the repository already contains working implementations.
Priority 1: Core collection and deck-building experience

1. Audit existing collection storage and quantity management.
2. Fix collection ownership and deck-allocation consistency.
3. Improve collection organization and editing.
4. Implement or correct collection valuation.
5. Add the Collection Match view to commander pages.
6. Implement the Suggested Deck view with real budget and bracket constraints.
7. Improve My Decks, deck import, and deck analysis.
8. Validate deck legality and completeness.
9. Ensure generated decks accurately distinguish owned cards from missing purchases.

Priority 2: Data quality and analysis

1. Improve EDHREC statistics and attribution.
2. Improve pricing accuracy, currency handling, and timestamps.
3. Add transparent bracket and salt estimates.
4. Implement advanced collection search and filters.
5. Improve collection analytics and historical snapshots.
6. Implement the Deck Simulator.
7. Add appropriate automated tests for collection and deck-generation logic.

Priority 3: Integrations and usability

1. Add external-provider icons and links.
2. Improve custom collection lists.
3. Add additional collection presentation modes.
4. Implement the announcement banner and polished animations.
5. Evaluate and implement Google sign-in and synchronization.
6. Investigate mobile card scanning.
7. Improve documentation and deployment workflows.

Do not sacrifice core data integrity to implement visually impressive secondary features.
14. Development and Quality Requirements
14.1 Repository audit
Before modifying files, inspect the existing repository.
Identify:

* Application framework.
* Programming language.
* Project structure.
* Existing pages and routes.
* Shared components.
* Styling system.
* State management.
* Database schema.
* Authentication.
* API clients.
* External integrations.
* Card-data sources.
* Pricing methodology.
* Collection import and export.
* Deck-generation logic.
* Commander discovery.
* Existing tests.
* Environment variables.
* Build and deployment configuration.

Inspect relevant source files rather than relying solely on filenames or README descriptions.
Determine which features are:

1. Fully implemented and working.
2. Partially implemented.
3. Present only as UI or placeholder data.
4. Missing.
5. Blocked by unavailable external services or credentials.

Do not assume that a feature works simply because its interface exists.
14.2 Architecture and data integrity
Reuse existing components and services wherever practical.
Avoid:

* Duplicate data-fetching logic.
* Conflicting sources of truth.
* Unnecessary dependencies.
* Destructive schema changes.
* Hardcoded fake statistics.
* Placeholder functionality presented as complete.
* Breaking changes without migration plans.
* Unnecessary rewrites of working modules.

Maintain consistent representations of card identities, printings, finishes, quantities, prices, collection ownership, and deck allocations.
Use stable identifiers and validated data models.
Keep external data fetching, caching, calculations, and presentation separated appropriately.
Use transactions or equivalent safeguards for operations that modify related collection and deck-allocation records.
Preserve existing user data during migrations.
14.3 Data reliability
Use real provider data whenever practical.
Document data provenance and limitations.
Implement sensible caching and refresh policies.
Handle:

* API failures.
* Rate limits.
* Missing card data.
* Missing prices.
* Stale cached information.
* Unsupported printings.
* Invalid decklists.
* Duplicate imports.
* Partial results.

Do not fabricate missing information to make the interface look complete.
Clearly distinguish between verified data, estimates, heuristic calculations, and unavailable information.
14.4 Testing
Add or improve tests for:

* Collection imports.
* Quantity updates.
* Duplicate detection.
* Printing-specific records.
* Card ownership.
* Deck allocation.
* Collection valuation.
* Currency conversion.
* Price timestamps.
* Deck generation.
* Singleton rules.
* Color identity.
* Banned cards.
* Deck completeness.
* Missing-card calculations.
* Bracket analysis.
* Authentication and access control.
* Simulator calculations.

Run the available:

* Unit tests.
* Integration tests.
* Type checks.
* Linting.
* Production build.
* Relevant end-to-end workflows.

Fix regressions caused by the changes.
Do not report tests as passing unless they were actually executed and passed.
If a test cannot be run, identify the limitation.
14.5 User experience
Test the primary workflows:

1. Open the collection.
2. Search and filter cards.
3. Edit a quantity.
4. Inspect collection value.
5. Open a commander.
6. Review Collection Match.
7. Generate a Suggested Deck.
8. Verify ownership and missing cards.
9. Save a deck.
10. Import an existing deck.
11. Analyze legality and bracket.
12. Compare deck alternatives.
13. Use the simulator where implemented.

Check desktop and mobile layouts.
Verify loading, error, empty, and unavailable-data states.
14.6 Documentation
Document:

* New features.
* Architecture changes.
* Database migrations.
* Environment variables.
* API credentials.
* External service requirements.
* Setup instructions.
* Testing procedures.
* Known limitations.
* Deployment considerations.
* Outstanding tasks.

Preserve existing documentation and update it rather than creating redundant competing instructions.
15. Execution Strategy and Progress Reporting
Do not attempt to implement every feature in one massive change.
Work incrementally, following the implementation priorities and the existing architecture.
Phase 1: Inspect

* Review the repository.
* Identify the current application structure and technology stack.
* Inspect the existing commander, collection, deck-generation, and analytics workflows.
* Identify reusable components and data models.
* Inspect the existing collection import logic, pricing logic, and integrations.
* Identify broken functionality, placeholders, technical risks, and missing dependencies.
* Establish a baseline by running the available tests, type checks, linting, and build.

Phase 2: Plan
Provide a concise audit report covering:

* Existing architecture.
* Features that already work.
* Features that are partially implemented.
* Missing functionality.
* Critical data-integrity problems.
* External API or authentication dependencies.
* Recommended first implementation phase.

Create a prioritized implementation checklist in the repository.
The checklist must distinguish completed, in-progress, blocked, and unstarted work.
Do not spend excessive time producing a theoretical plan. Once the initial audit is complete, proceed with implementation.
Phase 3: Implement
For each manageable phase:

1. Inspect the relevant source code.
2. Explain significant architectural decisions briefly.
3. Implement a complete, useful feature.
4. Add or update tests.
5. Run the relevant validation commands.
6. Fix regressions.
7. Update the implementation checklist.
8. Document any remaining limitations.

Prefer small, verifiable changes over a massive rewrite.
Preserve all existing working functionality.
Do not implement multiple unrelated features simultaneously if doing so makes testing and debugging difficult.
Phase 4: Verify
After implementation:

* Run tests, linting, type checks, and production builds.
* Test relevant user workflows.
* Verify that collection ownership and deck allocations remain consistent.
* Verify that generated decks satisfy their stated constraints.
* Verify that pricing and statistics have accurate provenance.
* Confirm that external integrations are genuinely operational before marking them complete.
* Review the interface for responsiveness, accessibility, performance, and visual consistency.

Fix any regressions introduced by the implementation.
Phase 5: Report
Provide a concise completion report that includes:

* Features completed.
* Files or modules changed.
* Database or configuration changes.
* Tests executed and their actual results.
* Features that remain incomplete.
* External dependencies or credentials still required.
* Known bugs or limitations.
* Recommended next implementation phase.

Keep the repository's progress checklist updated so work can resume across Claude Code sessions.
A feature is not complete just because a button, card, page, or animation exists. It is complete only when the underlying logic, data handling, relevant error states, and intended user workflows have been implemented and appropriately tested.
If an API, credential, database migration, or external service is unavailable, implement the parts that can be completed safely and document the remaining dependency. Never pretend an integration is operational when it is not.
Final Objective
Transform this project into a reliable, collection-first MTG Commander platform that helps users:

* Discover commanders that fit their collection.
* Understand what they can build with their actual cards.
* Generate complete, legal, playable Commander decks.
* Compare collection match across different budgets and brackets.
* Identify missing cards and estimate acquisition costs.
* Analyze existing decks and their likely power levels.
* Understand relevant EDHREC statistics and card recommendations.
* Evaluate card prices and collection value using transparent data.
* Simulate opening hands and test deck consistency.
* Manage collections, custom lists, and deck allocations accurately.
* Discover the most valuable upgrades before spending money.

The platform must prioritize data integrity, collection ownership, usability, and transparency over superficial feature counts.
The central design principle is simple: show users what they can build with the cards they already own, then recommend the cheapest or strongest meaningful upgrades.
Do not generate an attractive 100-card decklist that quietly assumes the user will purchase 60 missing cards. Clearly identify what is already available, what must be purchased, and how each potential upgrade improves the deck.
Build a coherent product, not a collection of disconnected features.
Immediate instruction: Start by auditing the existing repository. Do not replace the project or begin a sweeping rewrite. Report what already works, identify the highest-priority gaps, and then implement improvements incrementally while preserving existing functionality.
alright im done what do you think here?


What di you think
