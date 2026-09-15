/*
 Chromebook-Famicompo-NSF-Player

 nsf-engine.js v1.1

 NSF Engine

 - GMECore v1.0 connection
 - Track control
 - PCM streaming
 - Metadata handling

*/


const NSFEngine = {


    ready:false,

    playing:false,


    currentTrack:0,

    trackCount:0,


    info:null,





    /*
      初期化

    */

    async init(){


        await GMECore.init();



        this.ready =
            GMECore.ready;



        console.log(
            "NSF Engine ready:",
            this.ready
        );


        return this.ready;


    },









    /*
      NSFロード

    */

    async load(buffer){



        if(
            !this.ready
        ){

            await this.init();

        }



        const result =
            GMECore.open(
                buffer
            );



        if(
            !result
        ){

            console.error(
                "NSF open failed"
            );


            return false;

        }





        this.trackCount =
            1;



        this.currentTrack =
            0;



        this.info =
            NSFParser.parse(
                buffer
            );



        console.log(
            "NSF loaded",
            this.info
        );



        return true;


    },









    /*
      再生開始

    */

    start(){



        GMECore.startTrack(
            this.currentTrack
        );



        this.playing =
            true;



    },









    /*
      停止

    */

    stop(){



        this.playing =
            false;



        GMECore.stop();



    },









    /*
      トラック変更

    */

    setTrack(track){



        this.currentTrack =
            track;



        GMECore.startTrack(
            track
        );



        return true;


    },









    /*
      情報取得

    */

    getInfo(){



        return this.info ||
        {


            title:
            "Unknown",


            artist:
            "Unknown",


            chip:
            "2A03"


        };


    },









    /*
      PCM取得

    */

    getFloatPCM(size){



        if(
            !this.playing
        ){

            return new Float32Array(
                size
            );

        }





        const pcm =
            GMECore.getSamples(
                size
            );



        const output =
            new Float32Array(
                pcm.length
            );



        for(
            let i=0;
            i<pcm.length;
            i++
        ){


            output[i] =
                pcm[i] / 32768;


        }



        return output;


    }





};





window.NSFEngine =
    NSFEngine;
