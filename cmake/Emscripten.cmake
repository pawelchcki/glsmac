# Emscripten supplies the browser versions of SDL, SDL_image, and FreeType.
# Do not discover or link host desktop libraries when cross-compiling.
TARGET_COMPILE_OPTIONS( ${PROJECT_NAME} PRIVATE
	-fexceptions
	-sUSE_SDL=2
	-sUSE_SDL_IMAGE=2
	-sSDL2_IMAGE_FORMATS=["bmp","pcx","png"]
	-sUSE_FREETYPE=1
)
TARGET_LINK_OPTIONS( ${PROJECT_NAME} PRIVATE
	-pthread
	-fexceptions
	-sUSE_SDL=2
	-sUSE_SDL_IMAGE=2
	-sSDL2_IMAGE_FORMATS=["bmp","pcx","png"]
	-sUSE_FREETYPE=1
	-sMIN_WEBGL_VERSION=2
	-sMAX_WEBGL_VERSION=2
	-sPROXY_TO_PTHREAD=1
	-sOFFSCREEN_FRAMEBUFFER=1
	-sGL_SUPPORT_EXPLICIT_SWAP_CONTROL=1
	-sPTHREAD_POOL_SIZE=8
	-sALLOW_MEMORY_GROWTH=1
	-sINITIAL_MEMORY=134217728
	-sSTACK_SIZE=4194304
	-sEXIT_RUNTIME=1
	-sFORCE_FILESYSTEM=1
	-sEXPORTED_RUNTIME_METHODS=FS,IDBFS,callMain,addRunDependency,removeRunDependency
	-lidbfs.js
)
SET_TARGET_PROPERTIES( ${PROJECT_NAME} PROPERTIES SUFFIX ".js" )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/index.html" "${CMAKE_BINARY_DIR}/bin/index.html" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/bootstrap.js" "${CMAKE_BINARY_DIR}/bin/bootstrap.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/isolation.js" "${CMAKE_BINARY_DIR}/bin/isolation.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/coi-serviceworker.js" "${CMAKE_BINARY_DIR}/bin/coi-serviceworker.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/asset-store.js" "${CMAKE_BINARY_DIR}/bin/asset-store.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/custom-maps.js" "${CMAKE_BINARY_DIR}/bin/custom-maps.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/installer-import.js" "${CMAKE_BINARY_DIR}/bin/installer-import.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/installer-worker.js" "${CMAKE_BINARY_DIR}/bin/installer-worker.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/web/config.js" "${CMAKE_BINARY_DIR}/bin/config.js" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/LICENSE" "${CMAKE_BINARY_DIR}/bin/LICENSE" COPYONLY )
CONFIGURE_FILE( "${PROJECT_SOURCE_DIR}/resource/font/terminus/COPYING" "${CMAKE_BINARY_DIR}/bin/terminus-COPYING" COPYONLY )

# The installer parser is a separate worker module. Its pinned dependencies and
# optimized build are shared between application configurations under one lock.
FIND_PACKAGE( Python3 COMPONENTS Interpreter REQUIRED )
SET( GLSMAC_INNOEXTRACT_OUTPUTS
	"${CMAKE_BINARY_DIR}/bin/innoextract.js"
	"${CMAKE_BINARY_DIR}/bin/innoextract.wasm"
	"${CMAKE_BINARY_DIR}/bin/innoextract-licenses.txt"
)
ADD_CUSTOM_COMMAND(
	OUTPUT ${GLSMAC_INNOEXTRACT_OUTPUTS}
	COMMAND ${CMAKE_COMMAND} -E env "EMXX=${CMAKE_CXX_COMPILER}"
		"${Python3_EXECUTABLE}" "${PROJECT_SOURCE_DIR}/tools/build-innoextract.py"
		--cache-dir "${PROJECT_SOURCE_DIR}/build/wasm-extractor"
		--output-dir "${CMAKE_BINARY_DIR}/bin" --jobs 2
	DEPENDS "${PROJECT_SOURCE_DIR}/tools/build-innoextract.py"
		"${PROJECT_SOURCE_DIR}/tools/innoextract/CMakeLists.txt"
		"${PROJECT_SOURCE_DIR}/tools/innoextract/browser.cpp"
		"${PROJECT_SOURCE_DIR}/tools/innoextract/browser-callback.hpp"
	VERBATIM
)
ADD_CUSTOM_TARGET( glsmac_innoextract DEPENDS ${GLSMAC_INNOEXTRACT_OUTPUTS} )
ADD_DEPENDENCIES( ${PROJECT_NAME} glsmac_innoextract )
ADD_CUSTOM_TARGET( glsmac_source
	COMMAND "${Python3_EXECUTABLE}" "${PROJECT_SOURCE_DIR}/tools/prepare-wasm-source.py"
		--output "${CMAKE_BINARY_DIR}/bin/GLSMAC-source.tar.gz"
	BYPRODUCTS "${CMAKE_BINARY_DIR}/bin/GLSMAC-source.tar.gz"
	VERBATIM
)
ADD_DEPENDENCIES( ${PROJECT_NAME} glsmac_source )
IF ( CMAKE_BUILD_TYPE STREQUAL "Debug" OR CMAKE_BUILD_TYPE STREQUAL "FastDebug" )
	TARGET_LINK_OPTIONS( ${PROJECT_NAME} PRIVATE
		"--embed-file" "${PROJECT_SOURCE_DIR}/GLSMAC_data/tests@/GLSMAC_data/tests"
	)
	FILE( GLOB_RECURSE GLSMAC_TEST_SCRIPTS CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/GLSMAC_data/tests/*" )
	SET_PROPERTY( TARGET ${PROJECT_NAME} APPEND PROPERTY LINK_DEPENDS ${GLSMAC_TEST_SCRIPTS} )
ENDIF ()

INCLUDE( FetchContent )
SET( YAML_CPP_BUILD_TESTS OFF CACHE BOOL "" FORCE )
SET( YAML_CPP_BUILD_TOOLS OFF CACHE BOOL "" FORCE )
SET( YAML_CPP_BUILD_CONTRIB OFF CACHE BOOL "" FORCE )
SET( YAML_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE )
FETCHCONTENT_DECLARE( YAML_CPP
	GIT_REPOSITORY https://github.com/jbeder/yaml-cpp
	GIT_TAG 2f86d13775d119edbb69af52e5f566fd65c6953b
)
FETCHCONTENT_MAKEAVAILABLE( YAML_CPP )
TARGET_COMPILE_OPTIONS( yaml-cpp PRIVATE -pthread -fexceptions )
TARGET_LINK_LIBRARIES( ${PROJECT_NAME} PRIVATE yaml-cpp )
