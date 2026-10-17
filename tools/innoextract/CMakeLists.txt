cmake_minimum_required(VERSION 3.16)
project(GLSMACInstallerExtractor LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this project with Emscripten")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(XZ_THREADS no CACHE STRING "" FORCE)
set(XZ_ENCODERS "" CACHE STRING "" FORCE)
set(XZ_DECODERS "lzma1;lzma2" CACHE STRING "" FORCE)
set(XZ_MICROLZMA_ENCODER OFF CACHE BOOL "" FORCE)
set(XZ_MICROLZMA_DECODER OFF CACHE BOOL "" FORCE)
set(XZ_LZIP_DECODER OFF CACHE BOOL "" FORCE)
set(XZ_NLS OFF CACHE BOOL "" FORCE)
set(XZ_DOC OFF CACHE BOOL "" FORCE)
foreach(tool XZ XZDEC LZMADEC LZMAINFO SCRIPTS)
  set(XZ_TOOL_${tool} OFF CACHE BOOL "" FORCE)
endforeach()
add_subdirectory("${XZ_SOURCE}" xz EXCLUDE_FROM_ALL)

set(BOOST_FS_SOURCES codecvt_error_category exception directory operations path
  path_traits portability unique_path utf8_codecvt_facet)
set(BOOST_SOURCES)
foreach(source IN LISTS BOOST_FS_SOURCES)
  list(APPEND BOOST_SOURCES "${BOOST_SOURCE}/libs/filesystem/src/${source}.cpp")
endforeach()
file(GLOB BOOST_PROGRAM_OPTIONS_SOURCES "${BOOST_SOURCE}/libs/program_options/src/*.cpp")
list(APPEND BOOST_SOURCES ${BOOST_PROGRAM_OPTIONS_SOURCES}
  "${BOOST_SOURCE}/libs/iostreams/src/zlib.cpp"
  "${BOOST_SOURCE}/libs/iostreams/src/bzip2.cpp")

file(GLOB_RECURSE INNO_SOURCES "${INNO_SOURCE}/src/*.cpp")
list(FILTER INNO_SOURCES EXCLUDE REGEX "/(cli/debug|util/windows)\\.cpp$")
list(APPEND INNO_SOURCES "${CMAKE_CURRENT_BINARY_DIR}/release.cpp")
set_source_files_properties("${INNO_SOURCE}/src/cli/main.cpp"
  PROPERTIES COMPILE_DEFINITIONS "main=InnoextractMain")

add_executable(innoextract ${INNO_SOURCES} ${BOOST_SOURCES} browser.cpp)
target_include_directories(innoextract PRIVATE "${INNO_SOURCE}/src"
  "${BOOST_SOURCE}" "${XZ_SOURCE}/src/liblzma/api"
  "${CMAKE_CURRENT_BINARY_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_definitions(innoextract PRIVATE BOOST_ALL_NO_LIB
  BOOST_FILESYSTEM_STATIC_LINK BOOST_FILESYSTEM_SINGLE_THREADED
  BOOST_FILESYSTEM_DISABLE_STATX BOOST_DATE_TIME_NO_LIB)
target_compile_options(innoextract PRIVATE -O2 -fexceptions -sUSE_ZLIB=1 -sUSE_BZIP2=1)
target_link_libraries(innoextract PRIVATE liblzma)
target_link_options(innoextract PRIVATE -O2 -fexceptions -sUSE_ZLIB=1 -sUSE_BZIP2=1
  -sMODULARIZE=1 -sEXPORT_NAME=createInnoextract -sENVIRONMENT=worker,node
  -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=131072 -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=2147483648 -sSTACK_SIZE=4194304
  -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0
  -sEXPORTED_RUNTIME_METHODS=FS,WORKERFS,NODEFS,callMain,ccall
  -lworkerfs.js -lnodefs.js)
set_target_properties(innoextract PROPERTIES SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/bin")

set(INNOEXTRACT_HAVE_ARC4 1)
set(INNOEXTRACT_HAVE_LZMA 1)
set(INNOEXTRACT_HAVE_BUILTIN_CONV 1)
set(INNOEXTRACT_HAVE_ALIGNOF 1)
set(INNOEXTRACT_HAVE_STD_UNIQUE_PTR 1)
set(INNOEXTRACT_HAVE_BUILTIN_BSWAP16 1)
set(INNOEXTRACT_HAVE_BUILTIN_BSWAP32 1)
set(INNOEXTRACT_HAVE_BUILTIN_BSWAP64 1)
set(INNOEXTRACT_HAVE_TIMEGM 1)
set(INNOEXTRACT_HAVE_GMTIME_R 1)
configure_file("${INNO_SOURCE}/src/configure.hpp.in" configure.hpp)
