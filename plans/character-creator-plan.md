# Character Creator Wizard Plan

## Overview
Create a step-by-step character creation wizard that integrates with the DataManager's loaded data (races, classes, backgrounds, feats, equipment) to help users create characters for the VTT.

## Requirements Summary
- **Type**: Step-by-step wizard with clear progression
- **Location**: In the DataManager panel (as a new tab)
- **Steps**: Name → Race → Class → Background → Ability Scores → Equipment → Review & Create

## Architecture

### Component Structure
```
client/src/components/
├── CharacterCreatorWizard.tsx    # Main wizard container
├── CharacterCreatorSteps/
│   ├── NameStep.tsx               # Character name and basic info
│   ├── RaceStep.tsx               # Race/species selection from DataManager
│   ├── ClassStep.tsx              # Class selection from DataManager
│   ├── BackgroundStep.tsx          # Background selection from DataManager
│   ├── AbilityScoresStep.tsx      # Ability score assignment
│   ├── EquipmentStep.tsx          # Starting equipment selection
│   └── ReviewStep.tsx             # Summary and create button
└── CharacterCreator.css            # Styles for the wizard
```

### Data Flow
1. Each step pulls available options from DataManager's loaded modules
2. Character data is accumulated in local state as user progresses
3. Final step creates a CharacterSheet object and saves to storage

## Implementation Steps

### Step 1: Create CharacterCreatorWizard Main Component
- Container managing wizard state and step navigation
- Progress indicator showing current step
- Navigation buttons (Back, Next, Create)
- Integration with DataManager context

### Step 2: NameStep - Basic Character Info
- Input for character name
- Optional player name field
- Level selector (default: 1)

### Step 3: RaceStep - Race Selection
- Browse/search loaded species/race data from DataManager
- Display race details when selected
- Auto-apply race bonuses to ability scores (optional toggle)

### Step 4: ClassStep - Class Selection  
- Browse/search loaded class data from DataManager
- Display class details including hit die, primary ability
- Show available subclasses (if any)

### Step 5: BackgroundStep - Background Selection
- Browse/search loaded background data from DataManager
- Display background features and skill proficiencies

### Step 6: AbilityScoresStep - Ability Score Assignment
- Standard array (15,14,13,12,10,8) or rolling method selection
- Manual point buy option
- Auto-populated from race/class if those are selected

### Step 7: EquipmentStep - Starting Equipment
- Show starting equipment from class/background
- Option to swap equipment choices
- Inventory management

### Step 8: ReviewStep - Summary & Create
- Display all character choices in summary format
- Calculate derived stats (proficiency bonus, saving throws, etc.)
- Create character button

### Step 9: Integrate with DataManager
- Add "Create Character" button to Characters tab in DataManager
- Open wizard in a modal or side panel

## Data Integration Points

### Available Data from DataManager
- **Species/Races**: Loaded module data with type "species" or "race"
- **Classes**: Loaded module data with type "class"
- **Backgrounds**: Loaded module data with type "background"
- **Feats**: Loaded module data with type "feat"
- **Items/Equipment**: Loaded module data with type "item"

### Character Storage
- Uses existing CharacterSheet interface from CharacterSheetPanel
- Saved to localStorage or server based on existing implementation

## UI/UX Design

### Visual Style
- Modal overlay with wizard container
- Step indicator at top showing progress
- Card-based selection for race/class/background
- Clear navigation buttons

### Interactions
- Click to select options
- "View Details" to see full item info in side panel
- Smooth transitions between steps
- Validation before proceeding to next step
