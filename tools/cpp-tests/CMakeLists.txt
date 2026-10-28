# Reuse the production-code regression probes; no alternative thread/buffer model.
FOREACH( PROBE thread-runtime buffer-copy )
	IF ( PROBE STREQUAL "thread-runtime" )
		SET( PRODUCTION_SOURCES common/Thread.cpp common/Common.cpp )
	ELSE ()
		SET( PRODUCTION_SOURCES types/Buffer.cpp common/Common.cpp )
	ENDIF ()
	LIST( TRANSFORM PRODUCTION_SOURCES PREPEND "${PROJECT_SOURCE_DIR}/src/" )
	ADD_EXECUTABLE( ${PROBE} "${PROJECT_SOURCE_DIR}/tools/wasm-tests/${PROBE}.cpp" ${PRODUCTION_SOURCES} )
	IF ( PROBE STREQUAL "thread-runtime" )
		TARGET_SOURCES( ${PROBE} PRIVATE "${PROJECT_SOURCE_DIR}/tools/wasm-tests/thread-log.cpp" )
	ENDIF ()
	GLSMAC_CONFIGURE_TARGET( ${PROBE} )
	TARGET_INCLUDE_DIRECTORIES( ${PROBE} PRIVATE "${PROJECT_SOURCE_DIR}/src" )
	# Keep assertions active in optimized configurations, too.
	TARGET_COMPILE_OPTIONS( ${PROBE} PRIVATE -UNDEBUG -ffunction-sections -fdata-sections )
	TARGET_LINK_OPTIONS( ${PROBE} PRIVATE -Wl,--gc-sections )
	ADD_TEST( NAME ${PROBE} COMMAND ${PROBE} )
	SET_TESTS_PROPERTIES( ${PROBE} PROPERTIES TIMEOUT 30 )
ENDFOREACH()

ADD_EXECUTABLE( cpp-standard standard.cpp )
GLSMAC_CONFIGURE_TARGET( cpp-standard )
ADD_TEST( NAME cpp-standard COMMAND cpp-standard )

# Standalone native tools also need real compile commands for changed-file
# analysis, even when a normal application build does not build their binaries.
FUNCTION( GLSMAC_ADD_ANALYSIS_TOOL TARGET )
	ADD_EXECUTABLE( ${TARGET} EXCLUDE_FROM_ALL ${ARGN} )
	GLSMAC_CONFIGURE_TARGET( ${TARGET} )
	TARGET_INCLUDE_DIRECTORIES( ${TARGET} PRIVATE "${PROJECT_SOURCE_DIR}/src" )
	TARGET_COMPILE_OPTIONS( ${TARGET} PRIVATE -ffunction-sections -fdata-sections )
	TARGET_LINK_OPTIONS( ${TARGET} PRIVATE -Wl,--gc-sections )
ENDFUNCTION()
GLSMAC_ADD_ANALYSIS_TOOL( behavior-probe
	"${PROJECT_SOURCE_DIR}/tools/behavior-tests/glsmac.cpp"
	"${PROJECT_SOURCE_DIR}/src/game/backend/technology/Table.cpp"
)
GLSMAC_ADD_ANALYSIS_TOOL( research-state
	"${PROJECT_SOURCE_DIR}/tools/behavior-tests/research_state.cpp"
	"${PROJECT_SOURCE_DIR}/src/game/backend/technology/Research.cpp"
	"${PROJECT_SOURCE_DIR}/src/types/Buffer.cpp"
	"${PROJECT_SOURCE_DIR}/src/common/Common.cpp"
)
GLSMAC_ADD_ANALYSIS_TOOL( smac-text-check "${PROJECT_SOURCE_DIR}/tools/smac-data/test_smac_text.cpp" )
GLSMAC_ADD_ANALYSIS_TOOL( smac-text-inspect "${PROJECT_SOURCE_DIR}/tools/smac-data/inspect.cpp" )
GLSMAC_ADD_ANALYSIS_TOOL( flic-check "${PROJECT_SOURCE_DIR}/tools/texture-tests/flic.cpp" "${PROJECT_SOURCE_DIR}/src/loader/texture/Flic.cpp" )
GLSMAC_ADD_ANALYSIS_TOOL( caviar-check "${PROJECT_SOURCE_DIR}/tools/texture-tests/caviar.cpp" "${PROJECT_SOURCE_DIR}/src/loader/texture/Caviar.cpp" )
