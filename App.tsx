import React, { Component } from 'react';
import {
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RtcEngine, {
  Color,
  RtcLocalView,
  RtcRemoteView,
  VideoRenderMode,
  VirtualBackgroundSource,
  VirtualBackgroundSourceStateReason,
  VirtualBackgroundSourceType,
} from 'react-native-agora';
import RNFS from 'react-native-fs';
import {launchImageLibrary} from 'react-native-image-picker'
import requestCameraAndAudioPermission from './components/Permission';
import styles from './components/Style';

interface Props {}

/**
 * @property peerIds Array for storing connected peers
 * @property appId
 * @property channelName Channel Name for the current session
 * @property joinSucceed State variable for storing success
 */
interface State {
  appId: string;
  token: string | null;
  channelName: string;
  joinSucceed: boolean;
  peerIds: number[];
  waiting: boolean;
}

export default class App extends Component<Props, State> {
  _engine?: RtcEngine;
  virtualSource: VirtualBackgroundSource;
  constructor(props) {
    super(props);
    this.virtualSource = new VirtualBackgroundSource({
      backgroundSourceType: VirtualBackgroundSourceType.Color,
      color: new Color(1, 1, 1),
    })
    this.state = {
      appId: '<YourAgoraAppID>',
      token: null,
      channelName: 'channel-x',
      joinSucceed: false,
      peerIds: [],
      waiting: true,
    };
    if (Platform.OS === 'android') {
      // Request required permissions from Android
      requestCameraAndAudioPermission().then(() => {
        console.log('requested!');
      });
    }
  }

  componentDidMount() {
    this.init();
  }

  pickImage = async () => {
    this.setState({waiting: true});
    await launchImageLibrary({ mediaType: 'photo' }, async (res) => {
      if (res.assets) {
        let uri = res.assets[0].uri;
        if (uri) {
          if(Platform.OS === 'android') {
            await RNFS.copyFile(uri, `${RNFS.DocumentDirectoryPath}/img.png`);
          } else if (Platform.OS === 'ios') {
            await RNFS.downloadFile({ fromUrl: uri, toFile: `${RNFS.DocumentDirectoryPath}/img.png` })
          }
          this.virtualSource = new VirtualBackgroundSource({
            backgroundSourceType: VirtualBackgroundSourceType.Img,
            source: `${RNFS.DocumentDirectoryPath}/img.png`,
          });
        }
      }
    });
    this.setState({waiting: false});
  }

  useBundledImage = async () => {
    this.setState({waiting: true});
    let img = require('./img.png')
    let uri = (Image.resolveAssetSource(img).uri)
    await RNFS.downloadFile({ fromUrl: uri, toFile: `${RNFS.DocumentDirectoryPath}/img.png` }).promise
    this.virtualSource = new VirtualBackgroundSource({
      backgroundSourceType: VirtualBackgroundSourceType.Img,
      source: RNFS.DocumentDirectoryPath + '/img.png',
    })
    this.setState({waiting: false});
  }

  useColor = () => {
    let color = new Color(1, 0, 0);
    this.virtualSource = new VirtualBackgroundSource({
      backgroundSourceType: VirtualBackgroundSourceType.Color,
      color: color,
    });
    this.setState({waiting: false});
  }

  /**
   * @name init
   * @description Function to initialize the Rtc Engine, attach event listeners and actions
   */
  init = async () => {
    const { appId } = this.state;
    this._engine = await RtcEngine.create(appId);
    await this._engine.enableVideo();

    this._engine.addListener('Warning', (warn) => {
      console.log('Warning', warn);
    });
    this._engine.addListener('VirtualBackgroundSourceEnabled', (status, code) => {
      console.log('VirtualBackgroundSourceEnabled', status, VirtualBackgroundSourceStateReason[code]);
    });

    this._engine.addListener('Error', (err) => {
      console.log('Error', err);
    });

    this._engine.addListener('UserJoined', (uid, elapsed) => {
      console.log('UserJoined', uid, elapsed);
      // Get current peer IDs
      const { peerIds } = this.state;
      // If new user
      if (peerIds.indexOf(uid) === -1) {
        this.setState({
          // Add peer ID to state array
          peerIds: [...peerIds, uid],
        });
      }
    });

    this._engine.addListener('UserOffline', (uid, reason) => {
      console.log('UserOffline', uid, reason);
      const { peerIds } = this.state;
      this.setState({
        // Remove peer ID from state array
        peerIds: peerIds.filter((id) => id !== uid),
      });
    });

    // If Local user joins RTC channel
    this._engine.addListener('JoinChannelSuccess', (channel, uid, elapsed) => {
      console.log('JoinChannelSuccess', channel, uid, elapsed);
      // Set state variable to true
      this.setState({
        joinSucceed: true,
      });
    });
  };

  /**
   * @name startCall
   * @description Function to start the call
   */
  startCall = async () => {
    // Join Channel using null token and channel name
    await this._engine?.enableVirtualBackground(true, this.virtualSource);
    await this._engine?.joinChannel(
      this.state.token,
      this.state.channelName,
      null,
      0
    );
  };

  /**
   * @name endCall
   * @description Function to end the call
   */
  endCall = async () => {
    await this._engine?.leaveChannel();
    this.setState({ peerIds: [], joinSucceed: false });
  };

  render() {
    return (
      <SafeAreaView style={styles.max}>
        <View style={styles.max}>
          <View style={styles.buttonHolderOuter}>
            <Text style={styles.heading}>Select Virtual Background:</Text>
            <View style={styles.buttonHolder}>
              <TouchableOpacity onPress={this.pickImage} style={styles.button}>
                <Text style={styles.buttonText}> Pick Image </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={this.useBundledImage} style={styles.button}>
                <Text style={styles.buttonText}> Use Asset </Text>
              </TouchableOpacity>


              <TouchableOpacity onPress={this.useColor} style={styles.button}>
                <Text style={styles.buttonText}> Use Color </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.buttonHolder}>

              <TouchableOpacity onPress={this.startCall} style={this.state.waiting ? styles.buttonDisabled : styles.button} disabled={this.state.waiting}>
                <Text style={styles.buttonText}> Start Call </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={this.endCall} style={styles.button}>
                <Text style={styles.buttonText}> End Call </Text>
              </TouchableOpacity>
            </View>
          </View>
          {this._renderVideos()}
        </View>
      </SafeAreaView>
    );
  }

  _renderVideos = () => {
    const { joinSucceed } = this.state;
    return joinSucceed ? (
      <View style={styles.fullView}>
        <RtcLocalView.SurfaceView
          style={styles.max}
          channelId={this.state.channelName}
          renderMode={VideoRenderMode.Hidden}
        />
        {this._renderRemoteVideos()}
      </View>
    ) : null;
  };

  _renderRemoteVideos = () => {
    const { peerIds } = this.state;
    return (
      <ScrollView
        style={styles.remoteContainer}
        contentContainerStyle={{ paddingHorizontal: 2.5 }}
        horizontal={true}
      >
        {peerIds.map((value) => {
          return (
            <RtcRemoteView.SurfaceView
              style={styles.remote}
              uid={value}
              channelId={this.state.channelName}
              renderMode={VideoRenderMode.Hidden}
              zOrderMediaOverlay={true}
            />
          );
        })}
      </ScrollView>
    );
  };
}
