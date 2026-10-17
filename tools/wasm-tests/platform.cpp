#include <emscripten/emscripten.h>

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "common/Mutex.h"
#include "network/simpletcp/SimpleTCP.h"
#include "util/FS.h"
#include "util/UUID.h"

const std::unordered_map< std::string, std::vector< unsigned char > >& GetEmbeddedFiles() {
	static const std::unordered_map< std::string, std::vector< unsigned char > > files = {
		{ "GLSMAC_data/default/fixture.txt", { 'e', 'm', 'b', 'e', 'd', 'd', 'e', 'd' } },
	};
	return files;
}

namespace {

class TestNetwork : public network::simpletcp::SimpleTCP {
public:
	int GetMode() const {
		return GetCurrentConnectionMode();
	}
};

std::unique_ptr< TestNetwork > net;
network::MT_Response response;
std::string uuid;
std::string file_contents;

}

extern "C" {

EMSCRIPTEN_KEEPALIVE void InitPlatform() {
	common::Mutex::SetMutexMode( common::MM_NONE );
	util::UUID::Init();
}

EMSCRIPTEN_KEEPALIVE const char* GenerateUUID() {
	uuid = util::UUID::Generate();
	return uuid.c_str();
}

EMSCRIPTEN_KEEPALIVE int PlatformFileExists( const char* path ) {
	return util::FS::FileExists( path );
}

EMSCRIPTEN_KEEPALIVE const char* ReadPlatformFile( const char* path, int binary ) {
	if ( binary ) {
		std::vector< unsigned char > bytes;
		util::FS::ReadFile( bytes, path );
		file_contents.assign( bytes.begin(), bytes.end() );
	}
	else {
		file_contents = util::FS::ReadTextFile( path );
	}
	return file_contents.c_str();
}

EMSCRIPTEN_KEEPALIVE void CreateNetwork() {
	net = std::make_unique< TestNetwork >();
	net->Start();
}

EMSCRIPTEN_KEEPALIVE void StopNetwork() {
	net->Stop();
}

EMSCRIPTEN_KEEPALIVE void DestroyNetwork() {
	net.reset();
}

EMSCRIPTEN_KEEPALIVE int ConnectNetwork( int host ) {
	return net->MT_Connect( host ? network::CM_SERVER : network::CM_CLIENT, "127.0.0.1" );
}

EMSCRIPTEN_KEEPALIVE int DisconnectNetwork() {
	return net->MT_Disconnect();
}

EMSCRIPTEN_KEEPALIVE int GetNetworkEvents() {
	return net->MT_GetEvents();
}

EMSCRIPTEN_KEEPALIVE void CancelNetworkRequest( int id ) {
	net->MT_Cancel( id );
}

EMSCRIPTEN_KEEPALIVE void IterateNetwork() {
	net->Iterate();
}

EMSCRIPTEN_KEEPALIVE int GetNetworkMode() {
	return net->GetMode();
}

EMSCRIPTEN_KEEPALIVE int GetNetworkResult( int id ) {
	response = net->MT_GetResult( id );
	return response.result;
}

EMSCRIPTEN_KEEPALIVE const char* GetNetworkMessage() {
	return response.message.c_str();
}

EMSCRIPTEN_KEEPALIVE int GetNetworkEventCount() {
	return response.events.size();
}

}
