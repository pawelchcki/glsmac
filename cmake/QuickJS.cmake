# The runtime is compiled for the application target, never supplied by a host
# package when cross-compiling. The libc/OS shell helpers are deliberately absent.
ENABLE_LANGUAGE( C )
INCLUDE( FetchContent )
IF ( POLICY CMP0135 )
	CMAKE_POLICY( SET CMP0135 NEW )
ENDIF ()
FETCHCONTENT_DECLARE( quickjs
	URL https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz
	URL_HASH SHA256=b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a
)
FETCHCONTENT_MAKEAVAILABLE( quickjs )
SET( GLSMAC_QUICKJS_SOURCE "${quickjs_SOURCE_DIR}/quickjs.c" )
IF ( WIN32 AND NOT MINGW )
	# Upstream's MinGW-oriented Windows build assumes POSIX time/pthreads.
	# Our Clang/MSVC ABI uses C11 time and the same no-Atomics policy as WASM.
	FILE( READ "${GLSMAC_QUICKJS_SOURCE}" GLSMAC_QUICKJS_WINDOWS )
	FOREACH( REQUIRED_TEXT "#define CONFIG_ATOMICS" )
		STRING( FIND "${GLSMAC_QUICKJS_WINDOWS}" "${REQUIRED_TEXT}" POSITION )
		IF ( POSITION EQUAL -1 )
			MESSAGE( FATAL_ERROR "Pinned QuickJS Windows compatibility patch no longer applies: ${REQUIRED_TEXT}" )
		ENDIF ()
	ENDFOREACH()
	STRING( REPLACE "#define CONFIG_ATOMICS" "/* Atomics are unavailable to GLSMAC policy. */" GLSMAC_QUICKJS_WINDOWS "${GLSMAC_QUICKJS_WINDOWS}" )
	FILE( MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/quickjs-windows" )
	SET( GLSMAC_QUICKJS_SOURCE "${CMAKE_BINARY_DIR}/quickjs-windows/quickjs.c" )
	SET( PREVIOUS_QUICKJS_WINDOWS "" )
	IF ( EXISTS "${GLSMAC_QUICKJS_SOURCE}" )
		FILE( READ "${GLSMAC_QUICKJS_SOURCE}" PREVIOUS_QUICKJS_WINDOWS )
	ENDIF ()
	IF ( NOT PREVIOUS_QUICKJS_WINDOWS STREQUAL GLSMAC_QUICKJS_WINDOWS )
		FILE( WRITE "${GLSMAC_QUICKJS_SOURCE}" "${GLSMAC_QUICKJS_WINDOWS}" )
	ENDIF ()
ENDIF ()
ADD_LIBRARY( glsmac_quickjs STATIC
	"${GLSMAC_QUICKJS_SOURCE}"
	"${quickjs_SOURCE_DIR}/dtoa.c"
	"${quickjs_SOURCE_DIR}/libregexp.c"
	"${quickjs_SOURCE_DIR}/libunicode.c"
	"${quickjs_SOURCE_DIR}/cutils.c"
)
SET_TARGET_PROPERTIES( glsmac_quickjs PROPERTIES C_STANDARD 11 C_STANDARD_REQUIRED ON )
TARGET_COMPILE_DEFINITIONS( glsmac_quickjs PRIVATE _GNU_SOURCE CONFIG_VERSION="2026-06-04" )
TARGET_INCLUDE_DIRECTORIES( glsmac_quickjs SYSTEM PUBLIC "${quickjs_SOURCE_DIR}" )
IF ( WIN32 AND NOT MINGW )
	TARGET_INCLUDE_DIRECTORIES( glsmac_quickjs PRIVATE "${CMAKE_CURRENT_LIST_DIR}/quickjs-windows" )
	# QuickJS BigInt division emits __udivti3; the MSVC CRT does not supply it.
	# Let the Clang driver select its matching architecture's builtins library.
	TARGET_LINK_OPTIONS( glsmac_quickjs INTERFACE --rtlib=compiler-rt )
ENDIF ()
IF ( NOT WIN32 )
	TARGET_COMPILE_OPTIONS( glsmac_quickjs PRIVATE -pthread )
	TARGET_LINK_LIBRARIES( glsmac_quickjs PUBLIC m )
ELSEIF ( MINGW )
	TARGET_COMPILE_OPTIONS( glsmac_quickjs PRIVATE -pthread )
	TARGET_LINK_LIBRARIES( glsmac_quickjs PUBLIC -pthread )
ENDIF ()
IF ( EMSCRIPTEN )
	TARGET_COMPILE_OPTIONS( glsmac_quickjs PRIVATE -fexceptions )
ENDIF ()
