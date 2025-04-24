@startuml RAG Process Flow
!theme plain
skinparam BackgroundColor transparent
skinparam ActivityBackgroundColor #FEFEFE
skinparam ActivityBorderColor #666666
skinparam ArrowColor #555555
skinparam ActivityFontSize 14
skinparam NoteFontSize 12
skinparam shadowing false
skinparam ActivityDiamondBackgroundColor #FEFEFE
skinparam ActivityDiamondBorderColor #666666
skinparam PartitionBorderColor #888888
skinparam PartitionBackgroundColor transparent

title RAG Process Flow: From Query to Response

|#aliceblue|User Interface|
start
:User submits query;

|#lavender|Query Processing|
:Analyze and understand query intent;
:Optimize query for retrieval;
:Select search strategy;

|#lightyellow|Knowledge Retrieval|
:Generate vector embeddings for query;
fork
  :Execute semantic search;
fork again
  :Apply metadata filters;
fork again
  :Perform hybrid search;
end fork
:Retrieve candidate knowledge items;

|#lightgreen|Context Selection & Relevance|
:Score relevance of retrieved items;
:Rank and filter based on scores;
:Deduplicate similar information;
:Select top N most relevant items;

|#mistyrose|Context Augmentation|
:Format selected context;
if (Context needs enhancement?) then (yes)
  :Generate additional context;
  :Merge with retrieved context;
else (no)
endif

|#lightcyan|Prompt Construction|
:Select appropriate prompt template;
:Apply template requirements;
:Integrate formatted context;
:Construct final augmented prompt;

|#wheat|LLM Integration|
:Submit prompt to LLM;
:Receive LLM response;

|#lightpink|Response Processing|
if (Response needs post-processing?) then (yes)
  :Apply filters and transformations;
  :Format for delivery;
else (no)
endif

|#aliceblue|User Interface|
:Display response to user;

|#lightgrey|Learning & Feedback|
fork
  :Store interaction in history;
  :Update relevance metrics;
  :Log performance metrics;
end fork

stop

legend right
  **Color Key**
  |= Color |= Stage |
  |<#aliceblue>| User Interface |
  |<#lavender>| Query Processing |
  |<#lightyellow>| Knowledge Retrieval |
  |<#lightgreen>| Context Selection |
  |<#mistyrose>| Context Augmentation |
  |<#lightcyan>| Prompt Construction |
  |<#wheat>| LLM Integration |
  |<#lightpink>| Response Processing |
  |<#lightgrey>| Learning & Feedback |
endlegend

@enduml
