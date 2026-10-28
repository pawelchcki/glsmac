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
ADD_LIBRARY( glsmac_quickjs STATIC
	"${quickjs_SOURCE_DIR}/quickjs.c"
	"${quickjs_SOURCE_DIR}/dtoa.c"
	"${quickjs_SOURCE_DIR}/libregexp.c"
	"${quickjs_SOURCE_DIR}/libunicode.c"
	"${quickjs_SOURCE_DIR}/cutils.c"
)
SET_TARGET_PROPERTIES( glsmac_quickjs PROPERTIES C_STANDARD 11 C_STANDARD_REQUIRED ON )
TARGET_COMPILE_DEFINITIONS( glsmac_quickjs PRIVATE _GNU_SOURCE CONFIG_VERSION="2026-06-04" )
TARGET_INCLUDE_DIRECTORIES( glsmac_quickjs SYSTEM PUBLIC "${quickjs_SOURCE_DIR}" )
IF ( NOT WIN32 )
	TARGET_COMPILE_OPTIONS( glsmac_quickjs PRIVATE -pthread )
	TARGET_LINK_LIBRARIES( glsmac_quickjs PUBLIC m )
ENDIF ()
IF ( EMSCRIPTEN )
	TARGET_COMPILE_OPTIONS( glsmac_quickjs PRIVATE -fexceptions )
ENDIF ()
