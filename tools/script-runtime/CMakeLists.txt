CMAKE_MINIMUM_REQUIRED( VERSION 3.20 )
PROJECT( GLSMACScriptProbe LANGUAGES C CXX )
INCLUDE( "${CMAKE_CURRENT_LIST_DIR}/../../cmake/ProjectOptions.cmake" )
INCLUDE( "${CMAKE_CURRENT_LIST_DIR}/../../cmake/ScriptRuntime.cmake" )
ADD_EXECUTABLE( script-runtime-probe main.cpp )
GLSMAC_CONFIGURE_TARGET( script-runtime-probe )
TARGET_LINK_LIBRARIES( script-runtime-probe PRIVATE glsmac_script )
TARGET_COMPILE_OPTIONS( script-runtime-probe PRIVATE -UNDEBUG )
SET_TARGET_PROPERTIES( script-runtime-probe PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin" )
IF ( EMSCRIPTEN )
	TARGET_COMPILE_OPTIONS( script-runtime-probe PRIVATE -fexceptions -pthread )
	TARGET_LINK_OPTIONS( script-runtime-probe PRIVATE
		-fexceptions -pthread -sMODULARIZE=1 -sEXPORT_NAME=createScriptProbe
		-sENVIRONMENT=web,node -sEXPORTED_RUNTIME_METHODS=FS,callMain
		-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4194304 -sEXIT_RUNTIME=1
	)
	SET_TARGET_PROPERTIES( script-runtime-probe PROPERTIES SUFFIX ".cjs" )
ENDIF ()
