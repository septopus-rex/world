const CONFIG={
    convert:1,					//convert to meter, can set this to show in inch
	precision:1000,				//3 digtal, to 0.001
	animate:16.7,
    limit:[4096,4096],
    default:{                   //默认的启动系统
        renderer:"rd_three",
        controller:"con_first",
    },
    hooks:{
        register:'reg',             //组件注册的方法
        initialize:'init',          //组件初始化的方法
        format:	'formatData',		//组件格式化数据的函数名,在这个函数里做计量单位转换
        check:	'checkData',		//对元素数据的数据位和类型进行校正
        point:	'adsorbPoints',		//组件提供的吸附点信息
        animat:	'animat',			//动画实现的入口
        update:	'yunData',			//格式化同步数据的入口
        active:	'active',			//高亮显示的数据转换入口
        info:	'info',				//信息显示
    },
    player:{						    //默认初始化保存的数据
        block:[10,29],					//默认的开始的土地块
        world:0,					    //用户的默认世界
        stop:-1,						//player站立的stop的id
        position:[8,8,0],				//默认开始的位置[x,y,z],z为站立高度
        rotation:[0,0,0],				//默认的旋转位置
        range:10,						//默认的显示范围，鸟瞰视图时候使用
        height:1.5,						//默认的人物高度
        shoulder:0.5,					//player的肩宽
        chest:0.22,						//player的胸厚
        moving:false,					//player是否正在运动，用于处理资源的加载和重建，不影响用户操作体验
        death:false,					//player是否死亡;
    },
    face:['x','y','z','-x','-y','-z'],  //face definition
}

export default CONFIG;